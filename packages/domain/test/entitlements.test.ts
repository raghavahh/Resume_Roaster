import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG, EntitlementResolver, isUsable, type CreditGrant } from '../src';

const NOW = new Date('2026-10-05T12:00:00Z');
const day = (offset: number): Date => new Date(NOW.getTime() + offset * 86_400_000);

let seq = 0;
function grant(overrides: Partial<CreditGrant> = {}): CreditGrant {
  seq += 1;
  return {
    id: `g${String(seq).padStart(3, '0')}`,
    packId: 'quick_fix',
    kind: 'rewrite',
    remaining: 1,
    grantedAt: day(-1),
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  };
}

const resolver = new EntitlementResolver(DEFAULT_CATALOG);

describe('isUsable', () => {
  it('needs remaining credits, no revocation and a future expiry', () => {
    expect(isUsable(grant(), NOW)).toBe(true);
    expect(isUsable(grant({ expiresAt: day(1) }), NOW)).toBe(true);
    expect(isUsable(grant({ remaining: 0 }), NOW)).toBe(false);
    expect(isUsable(grant({ revokedAt: day(-1) }), NOW)).toBe(false);
    expect(isUsable(grant({ expiresAt: day(-1) }), NOW)).toBe(false);
    expect(isUsable(grant({ expiresAt: NOW }), NOW)).toBe(false);
  });
});

describe('EntitlementResolver.pick', () => {
  it('returns null when nothing can pay', () => {
    expect(resolver.pick([], 'rewrite', NOW)).toBeNull();
    expect(resolver.pick([grant({ kind: 'cover_letter' })], 'rewrite', NOW)).toBeNull();
    expect(resolver.pick([grant()], 'roast', NOW)).toBeNull();
  });

  it('skips expired, revoked and empty grants', () => {
    const good = grant();
    const picked = resolver.pick(
      [grant({ expiresAt: day(-1) }), grant({ revokedAt: day(-1) }), grant({ remaining: 0 }), good],
      'rewrite',
      NOW,
    );
    expect(picked).toBe(good);
  });

  it('uses soonest-expiring pass credits before permanent Quick Fix credits (US-17)', () => {
    const quickFix = grant({ expiresAt: null, grantedAt: day(-10) });
    const pass = grant({ kind: 'any_rewrite', expiresAt: day(20), packId: 'job_hunter_pass' });
    expect(resolver.pick([quickFix, pass], 'rewrite', NOW)).toBe(pass);
  });

  it('prefers the soonest expiry among passes', () => {
    const later = grant({ expiresAt: day(25) });
    const sooner = grant({ expiresAt: day(3) });
    expect(resolver.pick([later, sooner], 'rewrite', NOW)).toBe(sooner);
  });

  it('prefers the specific kind over the shared pool at equal expiry', () => {
    const shared = grant({ kind: 'any_rewrite', expiresAt: day(5) });
    const specific = grant({ kind: 'rewrite', expiresAt: day(5) });
    expect(resolver.pick([shared, specific], 'rewrite', NOW)).toBe(specific);
  });

  it('then takes the oldest grant, then the lowest id', () => {
    const newer = grant({ grantedAt: day(-1) });
    const older = grant({ grantedAt: day(-5) });
    expect(resolver.pick([newer, older], 'rewrite', NOW)).toBe(older);

    const a = grant({ id: 'a', grantedAt: day(-2) });
    const b = grant({ id: 'b', grantedAt: day(-2) });
    expect(resolver.pick([b, a], 'rewrite', NOW)).toBe(a);
  });

  it('never pays for tailoring with a general rewrite credit', () => {
    const general = grant({ kind: 'rewrite' });
    const tailored = grant({ kind: 'tailored_rewrite', expiresAt: day(5) });
    expect(resolver.pick([general], 'tailor', NOW)).toBeNull();
    expect(resolver.pick([general, tailored], 'tailor', NOW)).toBe(tailored);
  });
});

describe('EntitlementResolver.pick edge cases', () => {
  it('prefers the specific kind when both never expire', () => {
    const shared = grant({ kind: 'any_rewrite' });
    const specific = grant({ kind: 'rewrite' });
    expect(resolver.pick([shared, specific], 'rewrite', NOW)).toBe(specific);
  });

  it('prefers a newer specific grant over an older shared one at equal expiry', () => {
    const olderShared = grant({ kind: 'any_rewrite', expiresAt: day(5), grantedAt: day(-9) });
    const newerSpecific = grant({ kind: 'rewrite', expiresAt: day(5), grantedAt: day(-1) });
    expect(resolver.pick([olderShared, newerSpecific], 'rewrite', NOW)).toBe(newerSpecific);
  });

  it('uses a sooner-expiring shared credit before a later tailored one', () => {
    const shared = grant({ kind: 'any_rewrite', expiresAt: day(2) });
    const tailored = grant({ kind: 'tailored_rewrite', expiresAt: day(20) });
    expect(resolver.pick([tailored, shared], 'tailor', NOW)).toBe(shared);
  });

  it('fails closed on an invalid expiry date', () => {
    expect(resolver.pick([grant({ expiresAt: new Date(Number.NaN) })], 'rewrite', NOW)).toBeNull();
  });

  it('is deterministic when everything ties, including the id', () => {
    const a = grant({ id: 'same', grantedAt: day(-2) });
    const b = grant({ id: 'same', grantedAt: day(-2) });
    expect(resolver.pick([a, b], 'rewrite', NOW)).toBe(a);
  });

  it('gives the same answer whatever order the grants arrive in', () => {
    const permanent = grant({ id: 'p1' });
    const pass = grant({ id: 'p2', expiresAt: day(3) });
    const twinA = grant({ id: 'a', expiresAt: day(9), grantedAt: day(-3) });
    const twinB = grant({ id: 'b', expiresAt: day(9), grantedAt: day(-3) });
    expect(resolver.pick([permanent, pass], 'rewrite', NOW)).toBe(pass);
    expect(resolver.pick([pass, permanent], 'rewrite', NOW)).toBe(pass);
    expect(resolver.pick([twinA, twinB], 'rewrite', NOW)).toBe(twinA);
    expect(resolver.pick([twinB, twinA], 'rewrite', NOW)).toBe(twinA);
  });

  it('orders ids by code unit, not locale (Z before a)', () => {
    const lower = grant({ id: 'a', grantedAt: day(-2) });
    const upper = grant({ id: 'Z', grantedAt: day(-2) });
    expect(resolver.pick([lower, upper], 'rewrite', NOW)).toBe(upper);
  });
});

describe('EntitlementResolver.balances', () => {
  it('lists only live grants, soonest-expiring first, as ISO strings', () => {
    const permanent = grant({ id: 'p', remaining: 1 });
    const pass = grant({ id: 'q', kind: 'any_rewrite', remaining: 7, expiresAt: day(10) });
    const dead = grant({ id: 'r', expiresAt: day(-1) });
    expect(resolver.balances([permanent, dead, pass], NOW)).toEqual([
      { kind: 'any_rewrite', remaining: 7, expiresAt: day(10).toISOString(), packId: 'quick_fix' },
      { kind: 'rewrite', remaining: 1, expiresAt: null, packId: 'quick_fix' },
    ]);
  });

  it('orders grants that both never expire by id', () => {
    const b = grant({ id: 'b' });
    const a = grant({ id: 'a' });
    expect(resolver.balances([b, a], NOW).map((x) => x.remaining)).toEqual([1, 1]);
  });
});
