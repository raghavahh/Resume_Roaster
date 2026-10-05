import { z } from 'zod';
import { ERROR_CODES } from '../errors';

/** Code points removed from all user text: C0 controls (except tab/newline), DEL, zero-width and bidi controls. */
function isStrippedCodePoint(cp: number): boolean {
  return (
    (cp < 0x20 && cp !== 0x09 && cp !== 0x0a) ||
    cp === 0x7f ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x2069) ||
    cp === 0xfeff
  );
}

/** Unicode NFC, unified newlines, invisible/bidi characters removed (PRD Flow 1 step 1). */
export function normaliseText(input: string): string {
  let out = '';
  for (const ch of input.replace(/\r\n?/g, '\n').normalize('NFC')) {
    if (!isStrippedCodePoint(ch.codePointAt(0) ?? 0)) {
      out += ch;
    }
  }
  return out.trim();
}

/**
 * A user-supplied text field: rejected early if absurdly long, then normalised,
 * then length-checked on the normalised value.
 */
export function boundedText(min: number, max: number): z.ZodType<string, string> {
  return z
    .string()
    .max(max * 2, { error: `Must be at most ${String(max)} characters` })
    .transform(normaliseText)
    .pipe(
      z
        .string()
        .min(min, { error: `Must be at least ${String(min)} characters` })
        .max(max, { error: `Must be at most ${String(max)} characters` }),
    );
}

/** One error shape for every failure (PRD B5). Never contains stack traces or internals. */
export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    requestId: z.string(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const HealthResponseSchema = z.object({ ok: z.literal(true) });
