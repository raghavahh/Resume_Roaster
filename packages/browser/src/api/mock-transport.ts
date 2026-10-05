import {
  AdminOverviewQuerySchema,
  CoverLetterRequestSchema,
  DEFAULT_CATALOG,
  EntitlementResolver,
  HTTP_STATUS,
  InterviewQuestionsRequestSchema,
  LIMITS,
  LinkedInRequestSchema,
  OrderRequestSchema,
  RewriteRequestSchema,
  RoastRequestSchema,
  TailorRequestSchema,
  VerifyRequestSchema,
  type Action,
  type CreditGrant,
  type ErrorCode,
  type Pack,
  type ProductId,
  type UsageEntry,
} from '@engine/domain';
import type { z } from 'zod';
import {
  fakeAdminOverview,
  fakeCoverLetter,
  fakeInterviewQuestions,
  fakeLinkedIn,
  fakeResumeDoc,
  fakeRoast,
  fakeTailor,
} from './mock-content';
import { ApiError, type ApiRequest, type ApiResponse, type Transport } from './transport';

/** Every UI state the PRD lists can be forced with a scenario (Phase 1 step 6). */
export const MOCK_SCENARIOS = [
  'happy',
  'quota_exceeded',
  'sold_out',
  'no_credits',
  'network_error',
  'server_error',
  'payment_failed',
] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export const MOCK_USER_ID = '00000000-0000-4000-8000-000000000001';
export const MOCK_ADMIN_TOKEN = 'mock-admin-token';

interface Ctx {
  readonly signedIn: boolean;
  readonly admin: boolean;
  readonly query: URLSearchParams;
  readonly body: unknown;
}

type Handler = (ctx: Ctx) => ApiResponse;

export interface MockOptions {
  readonly scenario?: MockScenario;
  readonly delayMs?: number;
  readonly now?: () => Date;
  readonly sleep?: (ms: number) => Promise<void>;
}

const ok = (body: unknown, status = 200): ApiResponse => ({ status, body });

function findPack(product: ProductId, packId: string): Pack | null {
  try {
    return DEFAULT_CATALOG.findPack(product, packId);
  } catch {
    return null;
  }
}

/**
 * An in-memory stand-in for the Worker API, for local UI work and tests. It follows the
 * same rules as the real server (strict schemas, quotas, credit priority, idempotent payments).
 */
export class MockTransport implements Transport {
  readonly #scenario: MockScenario;
  readonly #delayMs: number;
  readonly #now: () => Date;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #resolver = new EntitlementResolver(DEFAULT_CATALOG);
  readonly #routes: ReadonlyMap<string, Handler>;
  #grants: CreditGrant[] = [];
  #history: UsageEntry[] = [];
  readonly #orders = new Map<string, { packId: string; paid: boolean }>();
  #freeUsed = { anonymous: 0, signedIn: 0 };
  #seq = 0;

  constructor(options: MockOptions = {}) {
    this.#scenario = options.scenario ?? 'happy';
    this.#delayMs = options.delayMs ?? 0;
    this.#now = options.now ?? (() => new Date());
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#routes = this.#buildRoutes();
  }

  public async send(request: ApiRequest): Promise<ApiResponse> {
    if (this.#delayMs > 0) await this.#sleep(this.#delayMs);
    if (this.#scenario === 'network_error') {
      throw new ApiError('NETWORK', 'Could not reach the server. Check your connection.');
    }
    if (this.#scenario === 'server_error') return this.#error('INTERNAL', 'Something went wrong.');
    const url = new URL(request.path, 'https://mock.local');
    const handler = this.#routes.get(`${request.method} ${url.pathname}`);
    if (handler === undefined) return this.#error('NOT_FOUND', 'Not found.');
    const auth = request.headers['authorization'] ?? null;
    return handler({
      signedIn: auth !== null,
      admin: auth === `Bearer ${MOCK_ADMIN_TOKEN}`,
      query: url.searchParams,
      body: request.body,
    });
  }

  #buildRoutes(): ReadonlyMap<string, Handler> {
    const rewrite = (b: { targetRole?: string | undefined }) => ({
      resume: fakeResumeDoc(b.targetRole),
    });
    return new Map<string, Handler>([
      ['POST /v1/roaster/roast', (ctx) => this.#roast(ctx)],
      ['POST /v1/roaster/rewrite', this.#paid('rewrite', RewriteRequestSchema, rewrite)],
      ['POST /v1/roaster/tailor', this.#paid('tailor', TailorRequestSchema, fakeTailor)],
      [
        'POST /v1/roaster/cover-letter',
        this.#paid('cover_letter', CoverLetterRequestSchema, fakeCoverLetter),
      ],
      ['POST /v1/roaster/linkedin', this.#paid('linkedin', LinkedInRequestSchema, fakeLinkedIn)],
      [
        'POST /v1/roaster/interview-questions',
        this.#paid('interview_questions', InterviewQuestionsRequestSchema, fakeInterviewQuestions),
      ],
      ['GET /v1/me', (ctx) => this.#signedIn(ctx, () => ok(this.#me()))],
      [
        'GET /v1/billing/catalog',
        () => ok({ packs: DEFAULT_CATALOG.packsFor('roaster').map((p) => p.toPublic()) }),
      ],
      ['POST /v1/pay/order', (ctx) => this.#signedIn(ctx, () => this.#order(ctx.body))],
      ['POST /v1/pay/verify', (ctx) => this.#signedIn(ctx, () => this.#verify(ctx.body))],
      ['GET /v1/account/export', (ctx) => this.#signedIn(ctx, () => ok(this.#export()))],
      ['POST /v1/account/delete', (ctx) => this.#signedIn(ctx, () => this.#delete())],
      ['POST /v1/events', () => ok(null, 204)],
      ['GET /v1/admin/overview', (ctx) => this.#admin(ctx)],
    ]);
  }

  #roast(ctx: Ctx): ApiResponse {
    if (this.#scenario === 'sold_out')
      return this.#error('SOLD_OUT', 'Sold out today. Back tomorrow!');
    const parsed = RoastRequestSchema.safeParse(ctx.body);
    if (!parsed.success) return this.#error('VALIDATION', 'Please check your resume text.');
    const key = ctx.signedIn ? 'signedIn' : 'anonymous';
    const limit = ctx.signedIn ? LIMITS.freeRoastsPerDaySignedIn : LIMITS.freeRoastsPerDayAnonymous;
    if (this.#scenario === 'quota_exceeded' || this.#freeUsed[key] >= limit) {
      return this.#error('QUOTA_EXCEEDED', "You've used today's free roasts.");
    }
    this.#freeUsed = { ...this.#freeUsed, [key]: this.#freeUsed[key] + 1 };
    this.#record('roast');
    return ok({ result: fakeRoast(parsed.data), freeRoastsLeftToday: limit - this.#freeUsed[key] });
  }

  #paid<S extends z.ZodType>(
    action: Action,
    schema: S,
    produce: (body: z.infer<S>) => unknown,
  ): Handler {
    return (ctx) =>
      this.#signedIn(ctx, () => {
        const parsed = schema.safeParse(ctx.body);
        if (!parsed.success) return this.#error('VALIDATION', 'Please check your input.');
        const grant =
          this.#scenario === 'no_credits'
            ? null
            : this.#resolver.pick(this.#grants, action, this.#now());
        if (grant === null) return this.#error('NO_CREDITS', 'You are out of credits for this.');
        this.#grants = this.#grants.map((g) =>
          g.id === grant.id ? { ...g, remaining: g.remaining - 1 } : g,
        );
        this.#record(action);
        return ok({ result: produce(parsed.data), credits: this.#balances() });
      });
  }

  #order(body: unknown): ApiResponse {
    const parsed = OrderRequestSchema.safeParse(body);
    const pack = parsed.success ? findPack(parsed.data.product, parsed.data.packId) : null;
    if (pack === null) return this.#error('VALIDATION', 'Unknown pack.');
    const orderId = `order_MOCK${String(this.#next()).padStart(6, '0')}`;
    this.#orders.set(orderId, { packId: pack.id, paid: false });
    return ok({
      orderId,
      amount: pack.price.toPaise(),
      currency: 'INR',
      keyId: 'rzp_test_mock',
      packId: pack.id,
    });
  }

  #verify(body: unknown): ApiResponse {
    const parsed = VerifyRequestSchema.safeParse(body);
    const order = parsed.success ? this.#orders.get(parsed.data.orderId) : undefined;
    if (this.#scenario === 'payment_failed' || order === undefined) {
      return this.#error(
        'PAYMENT_INVALID',
        'We could not verify this payment. You were not charged twice.',
      );
    }
    if (!order.paid) {
      order.paid = true;
      this.#grantPack(order.packId);
    }
    return ok({ credits: this.#balances() });
  }

  #grantPack(packId: string): void {
    const now = this.#now();
    const pack = DEFAULT_CATALOG.findPack('roaster', packId);
    for (const [kind, count] of pack.creditEntries()) {
      const id = `grant_${String(this.#next())}`;
      const expiresAt = pack.expiresAt(now);
      this.#grants.push({
        id,
        packId,
        kind,
        remaining: count,
        grantedAt: now,
        expiresAt,
        revokedAt: null,
      });
    }
  }

  #me(): unknown {
    return {
      userId: MOCK_USER_ID,
      credits: this.#balances(),
      freeRoastsLeftToday: Math.max(0, LIMITS.freeRoastsPerDaySignedIn - this.#freeUsed.signedIn),
      history: this.#history,
    };
  }

  #export(): unknown {
    const now = this.#now().toISOString();
    const payments = [...this.#orders.entries()].map(([orderId, o]) => ({
      orderId,
      packId: o.packId,
      amountPaise: DEFAULT_CATALOG.findPack('roaster', o.packId).price.toPaise(),
      status: o.paid ? 'paid' : 'created',
      createdAt: now,
    }));
    const profile = { userId: MOCK_USER_ID, createdAt: now, consentedAt: now };
    return { exportedAt: now, profile, credits: this.#balances(), payments, usage: this.#history };
  }

  #delete(): ApiResponse {
    this.#grants = [];
    this.#history = [];
    this.#orders.clear();
    return ok(null, 204);
  }

  #admin(ctx: Ctx): ApiResponse {
    const parsed = AdminOverviewQuerySchema.safeParse(Object.fromEntries(ctx.query));
    if (!ctx.admin || !parsed.success) return this.#error('NOT_FOUND', 'Not found.');
    return ok(fakeAdminOverview(parsed.data.days, this.#now()));
  }

  #signedIn(ctx: Ctx, handle: () => ApiResponse): ApiResponse {
    return ctx.signedIn ? handle() : this.#error('UNAUTHENTICATED', 'Please sign in first.');
  }

  #balances(): unknown {
    return this.#resolver.balances(this.#grants, this.#now());
  }

  #record(action: Action): void {
    this.#history = [{ action, createdAt: this.#now().toISOString() }, ...this.#history].slice(
      0,
      50,
    );
  }

  #next(): number {
    this.#seq += 1;
    return this.#seq;
  }

  #error(code: ErrorCode, message: string): ApiResponse {
    const requestId = `mock-${String(this.#next())}`;
    return { status: HTTP_STATUS[code], body: { error: { code, message, requestId } } };
  }
}
