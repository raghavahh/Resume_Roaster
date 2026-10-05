import { z } from 'zod';
import { LIMITS } from '../limits';
import { boundedText } from './common';
import { resumeTextSchema, targetRoleSchema } from './roast';

export const jobPostSchema = boundedText(LIMITS.jobPostMinChars, LIMITS.jobPostMaxChars);

const line = (max: number) => z.string().max(max);

/**
 * A rewritten resume. Contact fields still hold placeholders such as `[NAME]` and `[EMAIL_1]`;
 * the browser swaps the real values back in locally (PRD Flow 2 step 5).
 */
export const ResumeDocSchema = z.object({
  contact: z.object({
    name: line(100),
    lines: z.array(line(120)).max(6),
  }),
  headline: line(160),
  summary: line(1200),
  sections: z
    .array(
      z.object({
        title: z.string().min(1).max(60),
        entries: z
          .array(
            z.object({
              heading: line(120),
              subheading: line(120),
              dates: line(40),
              bullets: z.array(z.string().min(1).max(300)).max(10),
            }),
          )
          .max(12),
      }),
    )
    .min(1)
    .max(10),
  skills: z.array(z.string().min(1).max(60)).max(40),
});
export type ResumeDoc = z.infer<typeof ResumeDocSchema>;

/** POST /v1/roaster/rewrite */
export const RewriteRequestSchema = z.strictObject({
  text: resumeTextSchema,
  targetRole: targetRoleSchema.optional(),
});
export type RewriteRequest = z.infer<typeof RewriteRequestSchema>;
export const RewriteResultSchema = z.object({ resume: ResumeDocSchema });
export type RewriteResult = z.infer<typeof RewriteResultSchema>;

/** POST /v1/roaster/tailor */
export const TailorRequestSchema = z.strictObject({
  text: resumeTextSchema,
  jobPost: jobPostSchema,
});
export type TailorRequest = z.infer<typeof TailorRequestSchema>;
export const TailorResultSchema = z.object({
  matchPct: z.int().min(0).max(100),
  missing: z.array(z.string().min(1).max(60)).max(30),
  resume: ResumeDocSchema,
});
export type TailorResult = z.infer<typeof TailorResultSchema>;

/** POST /v1/roaster/cover-letter */
export const CoverLetterRequestSchema = z.strictObject({
  text: resumeTextSchema,
  jobPost: jobPostSchema,
});
export type CoverLetterRequest = z.infer<typeof CoverLetterRequestSchema>;
export const CoverLetterResultSchema = z.object({ letter: z.string().min(200).max(4000) });
export type CoverLetterResult = z.infer<typeof CoverLetterResultSchema>;

/** POST /v1/roaster/linkedin */
export const LinkedInRequestSchema = z.strictObject({ text: resumeTextSchema });
export type LinkedInRequest = z.infer<typeof LinkedInRequestSchema>;
export const LinkedInResultSchema = z.object({
  headline: z.string().min(10).max(220),
  about: z.string().min(100).max(2600),
});
export type LinkedInResult = z.infer<typeof LinkedInResultSchema>;

/** POST /v1/roaster/interview-questions */
export const InterviewQuestionsRequestSchema = z.strictObject({
  text: resumeTextSchema,
  jobPost: jobPostSchema.optional(),
});
export type InterviewQuestionsRequest = z.infer<typeof InterviewQuestionsRequestSchema>;
export const InterviewQuestionsResultSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(10).max(300),
        tip: z.string().min(10).max(300),
      }),
    )
    .length(20),
});
export type InterviewQuestionsResult = z.infer<typeof InterviewQuestionsResultSchema>;
