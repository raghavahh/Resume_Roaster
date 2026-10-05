import { describe, expect, it } from 'vitest';
import {
  Catalog,
  DEFAULT_CATALOG,
  Pack,
  PublicPackSchema,
  ROASTER_PACKS,
  ValidationError,
  type PackDefinition,
} from '../src';

const base: PackDefinition = {
  id: 'test_pack',
  product: 'roaster',
  name: 'Test',
  tagline: 'Test pack',
  priceRupees: 49,
  credits: { rewrite: 2 },
  validityDays: 30,
  aiTier: 'paid',
  hourlyLimit: 30,
  highlight: false,
};

describe('Pack', () => {
  it('exposes its price in paise and its credits', () => {
    const pack = new Pack({ ...base, credits: { rewrite: 2, cover_letter: 1 } });
    expect(pack.id).toBe('test_pack');
    expect(pack.product).toBe('roaster');
    expect(pack.price.toPaise()).toBe(4900);
    expect(pack.aiTier).toBe('paid');
    expect(pack.hourlyLimit).toBe(30);
    expect(pack.creditEntries()).toEqual([
      ['rewrite', 2],
      ['cover_letter', 1],
    ]);
  });

  it('computes expiry for passes and none for permanent packs', () => {
    const bought = new Date('2026-10-05T10:00:00Z');
    expect(new Pack(base).expiresAt(bought)?.toISOString()).toBe('2026-11-04T10:00:00.000Z');
    expect(new Pack({ ...base, validityDays: null }).expiresAt(bought)).toBeNull();
  });

  it('produces a valid public view', () => {
    expect(PublicPackSchema.parse(new Pack(base).toPublic())).toMatchObject({
      id: 'test_pack',
      pricePaise: 4900,
      credits: [{ kind: 'rewrite', count: 2 }],
    });
  });

  it.each<[string, Partial<PackDefinition>]>([
    ['a bad id', { id: 'Bad-Id' }],
    ['no credits', { credits: {} }],
    ['zero credits', { credits: { rewrite: 0 } }],
    ['fractional credits', { credits: { rewrite: 1.5 } }],
    ['zero validity', { validityDays: 0 }],
    ['zero hourly limit', { hourlyLimit: 0 }],
    ['a zero price', { priceRupees: 0 }],
    ['a fractional price', { priceRupees: 99.5 }],
    ['a one-character id', { id: 'a' }],
    ['a 41-character id', { id: `a${'b'.repeat(40)}` }],
    ['NaN validity', { validityDays: Number.NaN }],
    ['infinite hourly limit', { hourlyLimit: Number.POSITIVE_INFINITY }],
  ])('rejects %s', (_label, override) => {
    expect(() => new Pack({ ...base, ...override })).toThrow(ValidationError);
  });

  it('accepts ids of exactly 2 and 40 characters', () => {
    expect(new Pack({ ...base, id: 'ab' }).id).toBe('ab');
    expect(new Pack({ ...base, id: `a${'b'.repeat(39)}` }).id).toHaveLength(40);
  });

  it('rejects values TypeScript would catch but config could still contain', () => {
    // @ts-expect-error -- simulating a mistyped product in config
    expect(() => new Pack({ ...base, product: 'other' })).toThrow(ValidationError);
    // @ts-expect-error -- simulating a mistyped AI tier in config
    expect(() => new Pack({ ...base, aiTier: 'free' })).toThrow(ValidationError);
    // @ts-expect-error -- simulating an unknown credit kind in config
    expect(() => new Pack({ ...base, credits: { rewrite: 1, unlimited: 1 } })).toThrow(
      ValidationError,
    );
  });

  it('is unaffected by later changes to its definition', () => {
    const credits = { rewrite: 2 };
    const pack = new Pack({ ...base, credits });
    credits.rewrite = 999;
    expect(pack.creditEntries()).toEqual([['rewrite', 2]]);
    expect(Object.isFrozen(pack.creditEntries())).toBe(true);
    expect(Object.isFrozen(DEFAULT_CATALOG.creditPool('rewrite'))).toBe(true);
  });
});

describe('Catalog', () => {
  it('finds packs the server sells, with server-side prices', () => {
    expect(DEFAULT_CATALOG.findPack('roaster', 'quick_fix').price.toPaise()).toBe(9900);
    expect(DEFAULT_CATALOG.findPack('roaster', 'job_hunter_pass').price.toPaise()).toBe(39900);
  });

  it('rejects unknown packs and packs from another product (S-05)', () => {
    expect(() => DEFAULT_CATALOG.findPack('roaster', 'free_money')).toThrow(ValidationError);
    expect(() => DEFAULT_CATALOG.findPack('hooks', 'quick_fix')).toThrow(ValidationError);
  });

  it('lists packs per product', () => {
    expect(DEFAULT_CATALOG.packsFor('roaster').map((p) => p.id)).toEqual(
      ROASTER_PACKS.map((def) => def.id),
    );
    expect(DEFAULT_CATALOG.packsFor('hooks')).toEqual([]);
  });

  it('defines feature pools, most specific first (PRD A6.3)', () => {
    expect(DEFAULT_CATALOG.creditPool('rewrite')).toEqual(['rewrite', 'any_rewrite']);
    expect(DEFAULT_CATALOG.creditPool('tailor')).toEqual(['tailored_rewrite', 'any_rewrite']);
    expect(DEFAULT_CATALOG.creditPool('roast')).toEqual([]);
  });

  it('gives the highest hourly limit among live packs', () => {
    expect(DEFAULT_CATALOG.hourlyLimitFor([], 'roaster')).toBe(30);
    expect(DEFAULT_CATALOG.hourlyLimitFor(['quick_fix', 'career_pro_pass'], 'roaster')).toBe(60);
    expect(DEFAULT_CATALOG.hourlyLimitFor(['gone_pack'], 'roaster')).toBe(30);
  });

  it('refuses duplicate packs', () => {
    expect(() => new Catalog([new Pack(base), new Pack(base)])).toThrow(ValidationError);
  });

  it('allows the same pack id in different products', () => {
    const catalog = new Catalog([new Pack(base), new Pack({ ...base, product: 'hooks' })]);
    expect(catalog.findPack('hooks', 'test_pack').product).toBe('hooks');
  });
});
