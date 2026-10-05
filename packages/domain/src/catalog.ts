import { PACK_ID_PATTERN, type PublicPack } from './contract/billing';
import { ValidationError } from './errors';
import {
  CREDIT_KINDS,
  CreditKindSchema,
  PaidAiTierSchema,
  ProductIdSchema,
  type Action,
  type AiTier,
  type CreditKind,
  type ProductId,
} from './features';
import { LIMITS } from './limits';
import { Money } from './money';

/** The product name. Change it here only (PRD header). */
export const BRAND_NAME = 'Resume Roaster';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PackDefinition {
  readonly id: string;
  readonly product: ProductId;
  readonly name: string;
  readonly tagline: string;
  readonly priceRupees: number;
  readonly credits: Readonly<Partial<Record<CreditKind, number>>>;
  /** null = never expires (Quick Fix); otherwise days from purchase (passes, ADR 0004). */
  readonly validityDays: number | null;
  readonly aiTier: Exclude<AiTier, 'free'>;
  readonly hourlyLimit: number;
  readonly highlight: boolean;
}

function isPositiveInt(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/** Runtime checks for what TypeScript can't guarantee (config could be edited or mistyped). */
function assertValidDefinition(def: PackDefinition): void {
  const fail = (why: string): never => {
    throw new ValidationError(`Pack ${def.id}: ${why}`);
  };
  if (!PACK_ID_PATTERN.test(def.id)) fail('bad id');
  if (!ProductIdSchema.safeParse(def.product).success) fail('unknown product');
  if (!PaidAiTierSchema.safeParse(def.aiTier).success) fail('bad AI tier');
  const keys = Object.keys(def.credits);
  if (keys.length === 0) fail('no credits');
  if (!keys.every((k) => CreditKindSchema.safeParse(k).success)) fail('unknown credit kind');
  if (!Object.values(def.credits).every((n) => isPositiveInt(n))) fail('bad credit count');
  if (def.validityDays !== null && !isPositiveInt(def.validityDays)) fail('bad validity');
  if (!isPositiveInt(def.hourlyLimit)) fail('bad hourly limit');
}

/** A purchasable bundle of credits. Validates itself; deeply immutable. */
export class Pack {
  readonly #def: PackDefinition;
  readonly #price: Money;
  readonly #credits: readonly (readonly [CreditKind, number])[];

  constructor(def: PackDefinition) {
    assertValidDefinition(def);
    this.#price = Money.ofRupees(def.priceRupees);
    if (this.#price.isZero()) throw new ValidationError(`Pack ${def.id}: must cost something`);
    this.#credits = Object.freeze(
      CREDIT_KINDS.flatMap((kind) => {
        const count = def.credits[kind];
        return count === undefined ? [] : [Object.freeze([kind, count] as const)];
      }),
    );
    this.#def = Object.freeze({ ...def, credits: Object.freeze({ ...def.credits }) });
  }

  public get id(): string {
    return this.#def.id;
  }

  public get product(): ProductId {
    return this.#def.product;
  }

  public get price(): Money {
    return this.#price;
  }

  public get aiTier(): Exclude<AiTier, 'free'> {
    return this.#def.aiTier;
  }

  public get hourlyLimit(): number {
    return this.#def.hourlyLimit;
  }

  public creditEntries(): readonly (readonly [CreditKind, number])[] {
    return this.#credits;
  }

  /** When credits from a purchase at `purchasedAt` stop working, or null if never. */
  public expiresAt(purchasedAt: Date): Date | null {
    const days = this.#def.validityDays;
    return days === null ? null : new Date(purchasedAt.getTime() + days * DAY_MS);
  }

  public toPublic(): PublicPack {
    return {
      id: this.#def.id,
      product: this.#def.product,
      name: this.#def.name,
      tagline: this.#def.tagline,
      pricePaise: this.#price.toPaise(),
      credits: this.#credits.map(([kind, count]) => ({ kind, count })),
      validityDays: this.#def.validityDays,
      highlight: this.#def.highlight,
    };
  }
}

/** Which credit kinds pay for each action, most specific first (PRD A6.3 feature pools). */
const CREDIT_POOLS: Readonly<Record<Action, readonly CreditKind[]>> = Object.freeze({
  roast: Object.freeze([]),
  rewrite: Object.freeze(['rewrite', 'any_rewrite'] as const),
  tailor: Object.freeze(['tailored_rewrite', 'any_rewrite'] as const),
  cover_letter: Object.freeze(['cover_letter'] as const),
  linkedin: Object.freeze(['linkedin'] as const),
  interview_questions: Object.freeze(['interview_questions'] as const),
});

/** The ONLY source of prices, packs and feature pools (PRD A6, B6). */
export class Catalog {
  readonly #packs: ReadonlyMap<string, Pack>;

  constructor(packs: readonly Pack[]) {
    const byKey = new Map<string, Pack>();
    for (const pack of packs) {
      const key = `${pack.product}:${pack.id}`;
      if (byKey.has(key)) throw new ValidationError(`Duplicate pack ${key}`);
      byKey.set(key, pack);
    }
    this.#packs = byKey;
  }

  /** Throws a ValidationError for any pack the server doesn't sell (S-05). */
  public findPack(product: ProductId, packId: string): Pack {
    const pack = this.#packs.get(`${product}:${packId}`);
    if (pack === undefined) throw new ValidationError('Unknown pack');
    return pack;
  }

  public packsFor(product: ProductId): readonly Pack[] {
    return [...this.#packs.values()].filter((pack) => pack.product === product);
  }

  public creditPool(action: Action): readonly CreditKind[] {
    return CREDIT_POOLS[action];
  }

  /** The highest hourly limit among the packs a user holds live credits from. */
  public hourlyLimitFor(livePackIds: readonly string[], product: ProductId): number {
    return livePackIds.reduce<number>((best, id) => {
      const pack = this.#packs.get(`${product}:${id}`);
      return pack === undefined ? best : Math.max(best, pack.hourlyLimit);
    }, LIMITS.paidRoutesPerHourDefault);
  }
}

/** Starting price hypotheses (PRD A6), as one-time packs and 30-day passes (ADR 0004). */
export const ROASTER_PACKS: readonly PackDefinition[] = [
  {
    id: 'quick_fix',
    product: 'roaster',
    name: 'Quick Fix',
    tagline: 'One full rewrite with an ATS-safe PDF. No subscription.',
    priceRupees: 99,
    credits: { rewrite: 1 },
    validityDays: null,
    aiTier: 'paid',
    hourlyLimit: LIMITS.paidRoutesPerHourDefault,
    highlight: false,
  },
  {
    id: 'starter_pass',
    product: 'roaster',
    name: 'Starter Pass',
    tagline: '30 days to fix your resume and start applying.',
    priceRupees: 199,
    credits: { rewrite: 5, tailored_rewrite: 5, cover_letter: 3, linkedin: 1 },
    validityDays: 30,
    aiTier: 'paid',
    hourlyLimit: LIMITS.paidRoutesPerHourDefault,
    highlight: false,
  },
  {
    id: 'job_hunter_pass',
    product: 'roaster',
    name: 'Job Hunter Pass',
    tagline: '30 days of tailored applications for an active job hunt.',
    priceRupees: 399,
    credits: { any_rewrite: 15, cover_letter: 10, linkedin: 3, interview_questions: 2 },
    validityDays: 30,
    aiTier: 'priority',
    hourlyLimit: LIMITS.paidRoutesPerHourDefault,
    highlight: true,
  },
  {
    id: 'career_pro_pass',
    product: 'roaster',
    name: 'Career Pro Pass',
    tagline: '30 days, high volume, for serious switchers.',
    priceRupees: 699,
    credits: { any_rewrite: 30, cover_letter: 25, linkedin: 5, interview_questions: 5 },
    validityDays: 30,
    aiTier: 'priority',
    hourlyLimit: 60,
    highlight: false,
  },
];

export const DEFAULT_CATALOG = new Catalog(ROASTER_PACKS.map((def) => new Pack(def)));
