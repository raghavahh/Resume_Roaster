import { z } from 'zod';
import { ActionSchema } from '../features';
import { CreditBalanceSchema, PackIdSchema } from './billing';

/** Usage history is metadata only. Generated content stays in the browser (AM-13). */
export const UsageEntrySchema = z.object({
  action: ActionSchema,
  createdAt: z.iso.datetime(),
});
export type UsageEntry = z.infer<typeof UsageEntrySchema>;

/** GET /v1/me. Every value comes from the server (US-14). */
export const MeResponseSchema = z.object({
  userId: z.uuid(),
  credits: z.array(CreditBalanceSchema),
  freeRoastsLeftToday: z.int().min(0),
  history: z.array(UsageEntrySchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const PAYMENT_STATUSES = ['created', 'paid', 'failed', 'refunded'] as const;

/** GET /v1/account/export: everything we hold about the caller (DPDP access right). */
export const AccountExportSchema = z.object({
  exportedAt: z.iso.datetime(),
  profile: z.object({
    userId: z.uuid(),
    createdAt: z.iso.datetime(),
    consentedAt: z.iso.datetime().nullable(),
  }),
  credits: z.array(CreditBalanceSchema),
  payments: z.array(
    z.object({
      orderId: z.string(),
      packId: PackIdSchema,
      amountPaise: z.int().positive(),
      status: z.enum(PAYMENT_STATUSES),
      createdAt: z.iso.datetime(),
    }),
  ),
  usage: z.array(UsageEntrySchema),
});
export type AccountExport = z.infer<typeof AccountExportSchema>;

/** POST /v1/account/delete. The user must type DELETE to confirm (US-10). */
export const DeleteAccountRequestSchema = z.strictObject({ confirm: z.literal('DELETE') });
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;
