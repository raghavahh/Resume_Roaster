import { z } from 'zod';

/** The three products sharing this engine (PRD B6). */
export const PRODUCT_IDS = ['roaster', 'hooks', 'colddm'] as const;
export const ProductIdSchema = z.enum(PRODUCT_IDS);
export type ProductId = z.infer<typeof ProductIdSchema>;

/** What an endpoint does. One action may draw from several credit kinds (its pool). */
export const ACTIONS = [
  'roast',
  'rewrite',
  'tailor',
  'cover_letter',
  'linkedin',
  'interview_questions',
] as const;
export const ActionSchema = z.enum(ACTIONS);
export type Action = z.infer<typeof ActionSchema>;

/** What a paid grant holds (PRD A6.3). `any_rewrite` can pay for a general or a tailored rewrite. */
export const CREDIT_KINDS = [
  'rewrite',
  'tailored_rewrite',
  'any_rewrite',
  'cover_letter',
  'linkedin',
  'interview_questions',
] as const;
export const CreditKindSchema = z.enum(CREDIT_KINDS);
export type CreditKind = z.infer<typeof CreditKindSchema>;

/** AI tiers (PRD B8). Free traffic can never use the paid or priority tiers. */
export const AI_TIERS = ['free', 'paid', 'priority'] as const;
export type AiTier = (typeof AI_TIERS)[number];
