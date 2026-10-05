import { describe, expect, it } from 'vitest';
import type { RoastRequest } from '@engine/domain';
import {
  ApiClient,
  ApiError,
  FetchTransport,
  MOCK_ADMIN_TOKEN,
  MockTransport,
  TURNSTILE_HEADER,
  type AccessTokenSource,
  type ApiRequest,
  type ApiResponse,
  type MockScenario,
  type Transport,
} from '../src';

const RESUME = 'Synthetic Candidate\nEDUCATION\nB.Tech 2026\nPROJECTS\n'.padEnd(
  400,
  '- Built a thing for 100 users\n',
);
const ROAST: RoastRequest = { text: RESUME, level: 'spicy', language: 'en', mode: 'fresher' };
const JOB = 'Example Corp is hiring a backend intern who knows Java and SQL. '.repeat(3);

const tokens = (token: string | null): AccessTokenSource => ({
  getAccessToken: () => Promise.resolve(token),
});

function client(token: string | null, scenario: MockScenario = 'happy'): ApiClient {
  return new ApiClient(
    new MockTransport({ scenario, now: () => new Date('2026-10-06T10:00:00Z') }),
    tokens(token),
  );
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (error) {
    return error instanceof ApiError ? error.code : 'NOT_API_ERROR';
  }
}

describe('ApiClient with the mock API: free roasts', () => {
  it('gives anonymous users one roast a day', async () => {
    const api = client(null);
    const first = await api.roast(ROAST, 'turnstile-token');
    expect(first.result.problems).toHaveLength(5);
    expect(first.freeRoastsLeftToday).toBe(0);
    expect(await codeOf(api.roast(ROAST, 'turnstile-token'))).toBe('QUOTA_EXCEEDED');
  });

  it('gives signed-in users three', async () => {
    const api = client('user-token');
    for (const left of [2, 1, 0]) {
      expect((await api.roast(ROAST, null)).freeRoastsLeftToday).toBe(left);
    }
    expect(await codeOf(api.roast(ROAST, null))).toBe('QUOTA_EXCEEDED');
  });

  it.each<[MockScenario, string]>([
    ['sold_out', 'SOLD_OUT'],
    ['quota_exceeded', 'QUOTA_EXCEEDED'],
    ['network_error', 'NETWORK'],
    ['server_error', 'INTERNAL'],
  ])('surfaces the %s state as %s', async (scenario, code) => {
    expect(await codeOf(client(null, scenario).roast(ROAST, 't'))).toBe(code);
  });

  it('rejects an invalid request with VALIDATION', async () => {
    expect(await codeOf(client(null).roast({ ...ROAST, text: 'hi' }, 't'))).toBe('VALIDATION');
  });
});

describe('ApiClient with the mock API: paying and spending', () => {
  it('requires sign-in for paid routes without calling the server', async () => {
    expect(await codeOf(client(null).rewrite({ text: RESUME }))).toBe('UNAUTHENTICATED');
  });

  it('buys Quick Fix, credits once even if verify is replayed, then spends it (US-7, S-06)', async () => {
    const api = client('user-token');
    expect(await codeOf(api.rewrite({ text: RESUME }))).toBe('NO_CREDITS');
    const order = await api.createOrder({ product: 'roaster', packId: 'quick_fix' });
    expect(order.amount).toBe(9900);
    const proof = {
      orderId: order.orderId,
      paymentId: 'pay_TEST123abc',
      signature: 'a'.repeat(64),
    };
    await api.verifyPayment(proof);
    const replay = await api.verifyPayment(proof);
    expect(replay.credits).toEqual([
      { kind: 'rewrite', remaining: 1, expiresAt: null, packId: 'quick_fix' },
    ]);
    const rewrite = await api.rewrite({ text: RESUME, targetRole: 'Backend Intern' });
    expect(rewrite.result.resume.contact.name).toBe('[NAME]');
    expect(rewrite.credits).toEqual([]);
    expect(await codeOf(api.rewrite({ text: RESUME }))).toBe('NO_CREDITS');
  });

  it('spends pass credits on every paid feature', async () => {
    const api = client('user-token');
    const order = await api.createOrder({ product: 'roaster', packId: 'job_hunter_pass' });
    await api.verifyPayment({
      orderId: order.orderId,
      paymentId: 'pay_TEST123abc',
      signature: 'b'.repeat(64),
    });
    expect((await api.tailor({ text: RESUME, jobPost: JOB })).result.matchPct).toBe(72);
    expect((await api.coverLetter({ text: RESUME, jobPost: JOB })).result.letter).toContain(
      '[NAME]',
    );
    expect((await api.linkedIn({ text: RESUME })).result.headline.length).toBeGreaterThan(10);
    expect((await api.interviewQuestions({ text: RESUME })).result.questions).toHaveLength(20);
    const me = await api.me();
    expect(me.history.map((h) => h.action)).toEqual([
      'interview_questions',
      'linkedin',
      'cover_letter',
      'tailor',
    ]);
  });

  it('rejects unknown packs and failed payments', async () => {
    const api = client('user-token');
    expect(await codeOf(api.createOrder({ product: 'roaster', packId: 'free_money' }))).toBe(
      'VALIDATION',
    );
    const failing = client('user-token', 'payment_failed');
    const order = await failing.createOrder({ product: 'roaster', packId: 'quick_fix' });
    const proof = {
      orderId: order.orderId,
      paymentId: 'pay_TEST123abc',
      signature: 'c'.repeat(64),
    };
    expect(await codeOf(failing.verifyPayment(proof))).toBe('PAYMENT_INVALID');
  });

  it('shows the catalog, exports and deletes account data', async () => {
    const api = client('user-token');
    expect((await api.catalog('roaster')).packs.map((p) => p.id)).toContain('quick_fix');
    await api.roast(ROAST, null);
    expect((await api.exportAccount()).usage).toHaveLength(1);
    await api.deleteAccount();
    expect((await api.exportAccount()).usage).toHaveLength(0);
    await expect(api.track({ event: 'card_shared', product: 'roaster' })).resolves.toBeUndefined();
  });
});

describe('hidden admin overview (AM-04)', () => {
  it('returns analytics to the admin only; everyone else sees NOT_FOUND', async () => {
    const overview = await client(MOCK_ADMIN_TOKEN).adminOverview(7);
    expect(overview.daily).toHaveLength(7);
    expect(JSON.stringify(overview)).not.toMatch(/@|email/i);
    expect(await codeOf(client('user-token').adminOverview(7))).toBe('NOT_FOUND');
    expect(await codeOf(client(null).adminOverview(7))).toBe('UNAUTHENTICATED');
  });
});

describe('ApiClient request shape and response checks', () => {
  class Recorder implements Transport {
    public last: ApiRequest | null = null;
    constructor(private readonly reply: ApiResponse) {}
    public send(request: ApiRequest): Promise<ApiResponse> {
      this.last = request;
      return Promise.resolve(this.reply);
    }
  }

  it('sends the bearer token and the Turnstile token as headers', async () => {
    const recorder = new Recorder({ status: 500, body: null });
    await codeOf(new ApiClient(recorder, tokens('abc')).roast(ROAST, 'ts-token'));
    expect(recorder.last?.headers['authorization']).toBe('Bearer abc');
    expect(recorder.last?.headers[TURNSTILE_HEADER]).toBe('ts-token');
  });

  it('turns malformed success or error bodies into BAD_RESPONSE', async () => {
    const weird = new ApiClient(
      new Recorder({ status: 200, body: { score: 'lots' } }),
      tokens(null),
    );
    expect(await codeOf(weird.roast(ROAST, null))).toBe('BAD_RESPONSE');
    const html = new ApiClient(new Recorder({ status: 502, body: '<html>' }), tokens(null));
    expect(await codeOf(html.roast(ROAST, null))).toBe('BAD_RESPONSE');
  });
});

describe('FetchTransport', () => {
  it('sends JSON without cookies or caching and reads the JSON reply', async () => {
    let seen: RequestInit | undefined;
    const fakeFetch: typeof fetch = (_url, init) => {
      seen = init;
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    };
    const reply = await new FetchTransport('https://api.example.test/', fakeFetch).send({
      method: 'POST',
      path: '/v1/x',
      body: { a: 1 },
      headers: {},
    });
    expect(reply).toEqual({ status: 200, body: { ok: true } });
    expect(seen?.credentials).toBe('omit');
    expect(seen?.cache).toBe('no-store');
    expect(seen?.redirect).toBe('error');
    expect(seen?.body).toBe('{"a":1}');
  });

  it('maps network failures to NETWORK and non-JSON bodies to null', async () => {
    const failing: typeof fetch = () => Promise.reject(new TypeError('offline'));
    expect(
      await codeOf(
        new FetchTransport('https://x.test', failing).send({
          method: 'GET',
          path: '/',
          headers: {},
        }),
      ),
    ).toBe('NETWORK');
    const htmlFetch: typeof fetch = () => Promise.resolve(new Response('<html>', { status: 502 }));
    const reply = await new FetchTransport('https://x.test', htmlFetch).send({
      method: 'GET',
      path: '/',
      headers: {},
    });
    expect(reply).toEqual({ status: 502, body: null });
  });
});
