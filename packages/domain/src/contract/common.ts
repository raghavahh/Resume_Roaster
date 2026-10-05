import { z } from 'zod';
import { ERROR_CODES } from '../errors';

/**
 * Code points removed from all user text: C0/C1 controls (except tab/newline), DEL, soft hyphen,
 * zero-width space, LRM/RLM, bidi embeddings and isolates, word joiners, BOM, variation selectors
 * and Unicode tag characters (an invisible prompt-injection channel).
 * ZWNJ/ZWJ (U+200C/U+200D) are kept: Indic scripts and emoji need them.
 */
function isStrippedCodePoint(cp: number): boolean {
  return (
    (cp < 0x20 && cp !== 0x09 && cp !== 0x0a) ||
    (cp >= 0x7f && cp <= 0x9f) ||
    cp === 0xad ||
    cp === 0x200b ||
    cp === 0x200e ||
    cp === 0x200f ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x2069) ||
    cp === 0xfeff ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0xe0000 && cp <= 0xe007f) ||
    (cp >= 0xe0100 && cp <= 0xe01ef)
  );
}

const LINE_SEPARATOR = 0x2028;
const PARAGRAPH_SEPARATOR = 0x2029;

/**
 * Unified newlines, invisible characters removed, then NFKC (so fullwidth digits and
 * ligatures become plain ASCII the redactor can see), then trimmed (PRD Flow 1 step 1).
 */
export function normaliseText(input: string): string {
  let out = '';
  for (const ch of input.replace(/\r\n?/g, '\n')) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === LINE_SEPARATOR || cp === PARAGRAPH_SEPARATOR) out += '\n';
    else if (!isStrippedCodePoint(cp)) out += ch;
  }
  return out.normalize('NFKC').trim();
}

/** A one-line field: all whitespace (including newlines) collapses to single spaces. */
export function singleLine(input: string): string {
  return normaliseText(input).replace(/\s+/g, ' ');
}

/**
 * A user-supplied text field: rejected early if absurdly long, then normalised,
 * then length-checked on the normalised value.
 */
export function boundedText(
  min: number,
  max: number,
  normalise: (input: string) => string = normaliseText,
): z.ZodType<string, string> {
  return z
    .string()
    .max(max * 2, { error: `Must be at most ${String(max)} characters` })
    .transform(normalise)
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
