import type { Catalog } from './catalog';
import type { CreditBalance } from './contract/billing';
import type { Action, CreditKind } from './features';

/** One paid grant of credits (one row of `app.entitlements`). */
export interface CreditGrant {
  readonly id: string;
  readonly packId: string;
  readonly kind: CreditKind;
  readonly remaining: number;
  readonly grantedAt: Date;
  /** null = never expires. */
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
}

/** A grant can pay right now if it has credits left, isn't revoked and hasn't expired. */
export function isUsable(grant: CreditGrant, now: Date): boolean {
  return (
    grant.remaining > 0 &&
    grant.revokedAt === null &&
    (grant.expiresAt === null || grant.expiresAt.getTime() > now.getTime())
  );
}

/** Soonest expiry first; grants that never expire go last. */
function compareExpiry(a: CreditGrant, b: CreditGrant): number {
  if (a.expiresAt === null) return b.expiresAt === null ? 0 : 1;
  if (b.expiresAt === null) return -1;
  return a.expiresAt.getTime() - b.expiresAt.getTime();
}

/** Plain code-unit order, independent of locale, so it matches the database's ordering. */
function compareIds(a: CreditGrant, b: CreditGrant): number {
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * The single authority on which grant pays for an action (PRD A6.5, amended by AM-01):
 * 1. soonest-expiring first (use-it-or-lose-it credits protect permanent ones),
 * 2. then the most specific credit kind in the action's pool (`rewrite` before `any_rewrite`),
 * 3. then the oldest grant, then by id so the choice is deterministic.
 * The database function `reserve_entitlement` applies the same order atomically.
 */
export class EntitlementResolver {
  readonly #catalog: Catalog;

  constructor(catalog: Catalog) {
    this.#catalog = catalog;
  }

  /** The grant to draw from, or null if nothing can pay for this action. */
  public pick(grants: readonly CreditGrant[], action: Action, now: Date): CreditGrant | null {
    const pool = this.#catalog.creditPool(action);
    const candidates = grants.filter((g) => pool.includes(g.kind) && isUsable(g, now));
    const ordered = candidates.toSorted(
      (a, b) =>
        compareExpiry(a, b) ||
        pool.indexOf(a.kind) - pool.indexOf(b.kind) ||
        a.grantedAt.getTime() - b.grantedAt.getTime() ||
        compareIds(a, b),
    );
    return ordered[0] ?? null;
  }

  /** Live balances for display, soonest-expiring first. Expired and revoked grants are hidden. */
  public balances(grants: readonly CreditGrant[], now: Date): CreditBalance[] {
    return grants
      .filter((g) => isUsable(g, now))
      .toSorted((a, b) => compareExpiry(a, b) || compareIds(a, b))
      .map((g) => ({
        kind: g.kind,
        remaining: g.remaining,
        expiresAt: g.expiresAt === null ? null : g.expiresAt.toISOString(),
        packId: g.packId,
      }));
  }
}
