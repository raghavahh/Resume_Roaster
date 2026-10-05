import { z } from 'zod';
import { AI_TIERS, ProductIdSchema } from '../features';
import { PAYMENT_STATUSES } from './account';
import { PackIdSchema } from './billing';

/**
 * Product events the browser may report (POST /v1/events). Counted per day only:
 * no user id, IP, device id or content is stored with them (AM-04).
 */
export const ANALYTICS_EVENTS = [
  'pricing_viewed',
  'paywall_viewed',
  'checkout_started',
  'card_downloaded',
  'card_shared',
  'pdf_downloaded',
] as const;
export const AnalyticsEventSchema = z.strictObject({
  event: z.enum(ANALYTICS_EVENTS),
  product: ProductIdSchema,
});
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

/** GET /v1/admin/overview?days=7|30|90 (owner only; everyone else gets a plain 404). */
export const AdminOverviewQuerySchema = z.strictObject({
  days: z.enum(['7', '30', '90']).default('30').transform(Number),
});
export type AdminOverviewQuery = z.infer<typeof AdminOverviewQuerySchema>;

const count = z.int().min(0);
const paise = z.int().min(0);
const pct = z.number().min(0).max(100);
const isoDay = z.iso.date();

export const AdminDailyRowSchema = z.object({
  date: isoDay,
  signups: count,
  activeUsers: count,
  roasts: count,
  paidGenerations: count,
  paidOrders: count,
  revenuePaise: paise,
});
export type AdminDailyRow = z.infer<typeof AdminDailyRowSchema>;

export const AdminOverviewSchema = z.object({
  generatedAt: z.iso.datetime(),
  range: z.object({ from: isoDay, to: isoDay, days: z.int().positive() }),
  totals: z.object({
    users: count,
    signups: count,
    activeUsers: count,
    roasts: count,
    anonymousRoasts: count,
    paidGenerations: count,
    ordersCreated: count,
    paidOrders: count,
    payingUsers: count,
    revenuePaise: paise,
    refunds: count,
    refundedPaise: paise,
    soldOutDays: count,
  }),
  conversion: z.object({
    signupToPaidPct: pct,
    checkoutToPaidPct: pct,
  }),
  events: z.array(z.object({ event: z.enum(ANALYTICS_EVENTS), count })),
  daily: z.array(AdminDailyRowSchema),
  salesByPack: z.array(z.object({ packId: PackIdSchema, orders: count, revenuePaise: paise })),
  aiUsage: z.array(z.object({ provider: z.string(), tier: z.enum(AI_TIERS), calls: count })),
  recentOrders: z.array(
    z.object({
      orderId: z.string(),
      packId: PackIdSchema,
      amountPaise: z.int().positive(),
      status: z.enum(PAYMENT_STATUSES),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type AdminOverview = z.infer<typeof AdminOverviewSchema>;
