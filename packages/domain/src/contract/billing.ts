import { z } from 'zod';
import { CreditKindSchema, ProductIdSchema } from '../features';

/** Shared by the schema and `Pack` validation, so the two can't drift. */
export const PACK_ID_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
export const PackIdSchema = z.string().regex(PACK_ID_PATTERN, { error: 'Unknown pack' });

/** GET /v1/billing/catalog?product=… */
export const CatalogQuerySchema = z.strictObject({ product: ProductIdSchema.default('roaster') });
export type CatalogQuery = z.infer<typeof CatalogQuerySchema>;

/**
 * POST /v1/pay/order. The browser sends WHICH pack, never a price or amount (PRD A6.7, T4).
 * Strict: an extra `amount` field is rejected (S-05).
 */
export const OrderRequestSchema = z.strictObject({
  product: ProductIdSchema,
  packId: PackIdSchema,
});
export type OrderRequest = z.infer<typeof OrderRequestSchema>;

export const OrderResponseSchema = z.object({
  orderId: z.string(),
  /** In paise, decided by the server from the Catalog. For display and Checkout only. */
  amount: z.int().positive(),
  currency: z.literal('INR'),
  keyId: z.string(),
  packId: PackIdSchema,
});
export type OrderResponse = z.infer<typeof OrderResponseSchema>;

/** POST /v1/pay/verify, with the three values Razorpay Checkout hands back. */
export const VerifyRequestSchema = z.strictObject({
  orderId: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/),
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

/** One live grant as the server sees it. The UI only ever displays these values. */
export const CreditBalanceSchema = z.object({
  kind: CreditKindSchema,
  remaining: z.int().min(0),
  expiresAt: z.iso.datetime().nullable(),
  packId: PackIdSchema,
});
export type CreditBalance = z.infer<typeof CreditBalanceSchema>;

export const VerifyResponseSchema = z.object({ credits: z.array(CreditBalanceSchema) });
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;

/** A pack as shown on the pricing page (GET /v1/billing/catalog). Display only. */
export const PublicPackSchema = z.object({
  id: PackIdSchema,
  product: ProductIdSchema,
  name: z.string(),
  tagline: z.string(),
  pricePaise: z.int().positive(),
  credits: z.array(z.object({ kind: CreditKindSchema, count: z.int().positive() })),
  validityDays: z.int().positive().nullable(),
  highlight: z.boolean(),
});
export type PublicPack = z.infer<typeof PublicPackSchema>;

export const CatalogResponseSchema = z.object({ packs: z.array(PublicPackSchema) });
export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;

type PaidResponseShape<T extends z.ZodType> = z.ZodObject<{
  result: T;
  credits: z.ZodArray<typeof CreditBalanceSchema>;
}>;

/** Every paid generation returns its result plus the server's view of the remaining credits. */
export function paidResponseSchema<T extends z.ZodType>(result: T): PaidResponseShape<T> {
  return z.object({ result, credits: z.array(CreditBalanceSchema) });
}
