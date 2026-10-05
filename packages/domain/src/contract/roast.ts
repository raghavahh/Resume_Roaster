import { z } from 'zod';
import { LIMITS } from '../limits';
import { boundedText, singleLine } from './common';

export const ROAST_LEVELS = ['mild', 'spicy', 'nuclear'] as const;
export const RoastLevelSchema = z.enum(ROAST_LEVELS);
export type RoastLevel = z.infer<typeof RoastLevelSchema>;

export const LANGUAGES = ['en', 'hinglish'] as const;
export const LanguageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof LanguageSchema>;

/** Fresher/campus mode and service-to-product switch mode (PRD A4.5). */
export const ROAST_MODES = ['general', 'fresher', 'switcher'] as const;
export const RoastModeSchema = z.enum(ROAST_MODES);
export type RoastMode = z.infer<typeof RoastModeSchema>;

export const resumeTextSchema = boundedText(LIMITS.resumeMinChars, LIMITS.resumeMaxChars);
/** Single line: newlines can't smuggle extra "instructions" into the prompt. */
export const targetRoleSchema = boundedText(2, LIMITS.targetRoleMaxChars, singleLine);

/** POST /v1/roaster/roast. Strict: unknown keys (e.g. `userId`) are rejected (S-03). */
export const RoastRequestSchema = z.strictObject({
  text: resumeTextSchema,
  level: RoastLevelSchema,
  language: LanguageSchema,
  mode: RoastModeSchema,
  targetRole: targetRoleSchema.optional(),
});
export type RoastRequest = z.infer<typeof RoastRequestSchema>;

const score = z.int().min(0).max(100);

export const SUB_SCORE_KEYS = ['impact', 'clarity', 'ats', 'structure', 'keywords'] as const;

export const SubScoresSchema = z.object({
  impact: score,
  clarity: score,
  ats: score,
  structure: score,
  keywords: score,
});
export type SubScores = z.infer<typeof SubScoresSchema>;

/** Every problem carries a specific fix (PRD A8: a roast without help is just bullying). */
export const RoastProblemSchema = z.object({
  title: z.string().min(3).max(80),
  detail: z.string().min(10).max(300),
  fix: z.string().min(10).max(300),
});
export type RoastProblem = z.infer<typeof RoastProblemSchema>;

export const RoastResultSchema = z.object({
  score,
  subScores: SubScoresSchema,
  problems: z.array(RoastProblemSchema).length(5),
  savageLine: z.string().min(10).max(160),
});
export type RoastResult = z.infer<typeof RoastResultSchema>;

/** What the roast endpoint returns: the result plus the caller's remaining free roasts today. */
export const RoastResponseSchema = z.object({
  result: RoastResultSchema,
  freeRoastsLeftToday: z.int().min(0),
});
export type RoastResponse = z.infer<typeof RoastResponseSchema>;
