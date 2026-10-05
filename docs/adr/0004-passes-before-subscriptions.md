# ADR 0004: One-time 30-day passes in v1; subscriptions in v1.1

- Status: Accepted
- Date: 2026-10-05

## Context

The PRD prices v1 as a free tier, a ₹99 Quick Fix, and monthly plans (₹199 / ₹399 / ₹699) on Razorpay Subscriptions. Recurring billing is roughly half the build and test effort: a webhook-driven state machine, about 12 event types, out-of-order handling, a daily reconciler, upgrades and downgrades, per-period refunds, and 19 S-SUB attack tests. That serves a day-60 target of ₹8,000 MRR. Students tend to avoid UPI Autopay and card mandates, and job hunting is temporary.

## Decision

v1 sells **one-time** products only, all through the Orders API flow:

- **Quick Fix ₹99**: 1 rewrite credit, no expiry.
- **30-day passes**: a bundle of credits that expires 30 days after purchase. Tiers and limits are defined in `Catalog` during the contract step, starting from the PRD's plan allowances.

A pass is a `one_time_credit` grant with `expires_at`, handled by the same `grant_pack()`, payment verification and refund paths. Credits are consumed soonest-expiring first, then oldest, then the free daily quota.

## Consequences

- Removed from v1: Razorpay Subscriptions, mandates, `SubscriptionService`, `BillingCycleService`, `SubscriptionStateResolver`, `PlanChangeService`, `BillingReconciler`, the `subscriptions` table, tests F-17 to F-24 and S-SUB-01 to S-SUB-19.
- No RBI e-mandate obligations or pre-debit notifications in v1.
- Revenue isn't automatically recurring, so returning buyers have to repurchase. Measure repurchase rate as the stand-in for renewal.
- `EntitlementResolver` and `Catalog` are designed so subscriptions can be added in v1.1 as a new grant source without changing callers.
