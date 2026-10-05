/**
 * Removes personal details from resume text before it leaves the device (PRD Flow 1 step 2),
 * and again on the server (belt and braces). Pure: no DOM, no I/O.
 *
 * Input must already be normalised with `normaliseText` (NFKC, invisible characters removed),
 * which the request schemas do. Every pattern is anchored or bounded so runtime stays linear
 * in the input length (no ReDoS on 12k-character inputs).
 */

export const PLACEHOLDER_KINDS = ['EMAIL', 'PHONE', 'LINK', 'ADDRESS', 'ID', 'PERSONAL'] as const;
export type PlaceholderKind = (typeof PLACEHOLDER_KINDS)[number];
export type VaultKind = PlaceholderKind | 'NAME';

/** Kinds a rewrite must keep so contact details can be restored (AM-16). */
export const REQUIRED_PLACEHOLDER_KINDS: readonly VaultKind[] = ['NAME', 'EMAIL', 'PHONE', 'LINK'];

const EMAIL =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/g;
const URL_LIKE =
  /\b(?:https?:\/\/|www\.)[^\s<>"'()]+|(?<![a-z0-9.-])(?:(?:linkedin|github|gitlab|leetcode|kaggle|medium|hackerrank|codechef|codeforces|twitter|instagram|dribbble)\.com|x\.com|behance\.net|bit\.ly|[a-z0-9-]{1,63}\.github\.io|[a-z0-9-]{1,63}\.(?:dev|me|app|page|site|xyz)\b)(?:\/[^\s<>"'()]*)?/gi;
const DOB =
  /\b(?:d\.?[ \t]?o\.?[ \t]?b\.?|date[ \t]+of[ \t]+birth|born(?:[ \t]+on)?)[ \t:.-]*\d{1,2}(?:[/.-]\d{1,2}[/.-]|[ \t]+[A-Za-z]{3,9},?[ \t]+)\d{2,4}/gi;
const AADHAAR = /(?<!\d)[2-9]\d{3}[ \t-]?\d{4}[ \t-]?\d{4}(?!\d)/g;
const PAN = /\b[A-Za-z]{5}\d{4}[A-Za-z]\b/g;
const IFSC = /\b[A-Za-z]{4}0[A-Za-z0-9]{6}\b/g;
const INDIAN_MOBILE =
  /(?<![\d+])(?:(?:\+|00)?91[ \t-]?|0)?(?:[6-9]\d{4}[ \t-]?\d{5}|[6-9]\d{2}[ \t-]?\d{3}[ \t-]?\d{4})(?!\d)/g;
const LANDLINE = /(?<!\d)0\d{2,4}[ \t-]\d{6,8}(?!\d)/g;
const INTL_PHONE = /(?<![\w+])\+\d{1,3}[ \t-]?\(?\d{1,4}\)?(?:[ \t-]?\d{2,4}){2,4}(?!\d)/g;

const ADDRESS_LABEL = /^\s*(?:permanent\s+|current\s+|residential\s+)?address\s*[:\-–]/i;
const PIN_CODE = /(?<!\d)[1-9]\d{2}[ \t]?\d{3}(?!\d)/;
const PIN_AFTER_SEPARATOR = /[,\-–][ \t]*[1-9]\d{2}[ \t]?\d{3}[ \t.]*$/;
const ADDRESS_WORD =
  /\b(?:road|rd|street|nagar|colony|sector|flat|house|h\.?\s?no|dist|district|lane|apartments?|apts?|block|phase|layout|village|mandal|taluk|tehsil|p\.?o|near|opp|floor|plot|cross)\b/i;
const PERSONAL_LABEL =
  /^\s*(?:date\s+of\s+birth|d\.?\s?o\.?\s?b\.?|gender|sex|marital\s+status|religion|caste|category|nationality|father'?s?\s+name|mother'?s?\s+name|spouse(?:'s)?\s+name|age|languages?\s+known|blood\s+group|passport(?:\s+no\.?)?|hobbies)\s*[:\-–]/i;

const NAME_LABEL = /^\s*(?:full\s+)?name\s*[:\-–]\s*(.+)$/i;
const NAME_LINE = /^\p{L}[\p{L}.'-]*(?:[ \t]+\p{L}[\p{L}.'-]*){0,3}$/u;
const NOT_A_NAME =
  /\b(?:resume|curriculum|vitae|cv|bio-?data|profile|summary|objective|education|experience|skills|projects|contact|engineer|developer|manager|analyst|intern|designer|consultant|student|graduate|scientist|architect|lead|specialist|executive|officer|associate|administrator|tester|programmer|fresher|candidate)\b/i;
/** Once a section starts, the header (where the name lives) is over. */
const SECTION_HEADING =
  /^(?:summary|objective|career objective|education|experience|work experience|skills|technical skills|projects|profile|contact|about me)\s*:?$/i;
const HONORIFIC = /^(?:mr|mrs|ms|miss|dr|shri|sri|smt|kumari|prof)\.?$/i;
const PLACEHOLDER = /\[\s*(NAME|EMAIL|PHONE|LINK|ADDRESS|ID|PERSONAL)(?:[\s_-]*(\d+))?\s*\]/gi;

function canonical(kind: string, n: string | undefined): string {
  const k = kind.toUpperCase();
  return n === undefined ? `[${k}]` : `[${k}_${n}]`;
}

function digitCount(value: string): number {
  return value.replace(/\D/g, '').length;
}

/** The real values behind placeholders. Lives only in memory; never serialises. */
export class RedactionVault {
  readonly #byPlaceholder = new Map<string, string>();
  readonly #byValue = new Map<string, string>();
  readonly #counters = new Map<VaultKind, number>();

  /** Returns the placeholder for a value, reusing it if the value was seen before. */
  public placeholderFor(kind: VaultKind, value: string, numbered = kind !== 'NAME'): string {
    const key = `${kind}:${String(numbered)}:${value}`;
    const existing = this.#byValue.get(key);
    if (existing !== undefined) return existing;
    const placeholder = numbered ? this.#next(kind) : `[${kind}]`;
    this.#byValue.set(key, placeholder);
    this.#byPlaceholder.set(placeholder, value);
    return placeholder;
  }

  #next(kind: VaultKind): string {
    const n = (this.#counters.get(kind) ?? 0) + 1;
    this.#counters.set(kind, n);
    return `[${kind}_${String(n)}]`;
  }

  public get size(): number {
    return this.#byPlaceholder.size;
  }

  public placeholders(): readonly string[] {
    return [...this.#byPlaceholder.keys()];
  }

  /** Puts real values back. Tolerates small model edits such as `[Email 1]` (AM-16). */
  public restore(text: string): string {
    return text.replace(
      PLACEHOLDER,
      (match, kind: string, n: string | undefined) =>
        this.#byPlaceholder.get(canonical(kind, n)) ?? match,
    );
  }

  /**
   * Required placeholders that no longer appear in `text` (AM-16 survival check).
   * Name parts (`[NAME_1]`), personal lines and addresses may legitimately be dropped.
   */
  public missingIn(
    text: string,
    kinds: readonly VaultKind[] = REQUIRED_PLACEHOLDER_KINDS,
  ): readonly string[] {
    const present = new Set(
      [...text.matchAll(PLACEHOLDER)].map((m) => canonical(m[1] ?? '', m[2])),
    );
    return this.placeholders().filter((p) => {
      const isNamePart = /^\[NAME_\d+\]$/.test(p);
      const kind = p.slice(1, -1).replace(/_\d+$/, '');
      return !isNamePart && kinds.some((k) => k === kind) && !present.has(p);
    });
  }

  /** Accidental `JSON.stringify(vault)` must never leak values. */
  public toJSON(): Record<string, never> {
    return {};
  }
}

export interface Redaction {
  readonly redactedText: string;
  readonly vault: RedactionVault;
}

interface PatternStep {
  readonly re: RegExp;
  readonly kind: PlaceholderKind;
  readonly accept?: (match: string) => boolean;
}

/** Run before links, so `x@name.dev` is one email, not an email with a link inside. */
const EARLY_STEPS: readonly PatternStep[] = [
  { re: DOB, kind: 'PERSONAL' },
  { re: EMAIL, kind: 'EMAIL' },
];

/** Run after links. IDs before phones, because an Aadhaar number looks like a phone. */
const LATE_STEPS: readonly PatternStep[] = [
  { re: AADHAAR, kind: 'ID' },
  { re: PAN, kind: 'ID' },
  { re: IFSC, kind: 'ID' },
  { re: INDIAN_MOBILE, kind: 'PHONE' },
  { re: LANDLINE, kind: 'PHONE' },
  { re: INTL_PHONE, kind: 'PHONE', accept: (m) => digitCount(m) >= 8 && digitCount(m) <= 15 },
];

export class PiiRedactor {
  /** Replaces personal details with placeholders. The vault must stay on this device. */
  public redact(text: string, vault: RedactionVault = new RedactionVault()): Redaction {
    const name = this.#findName(text);
    let out = this.#applySteps(this.#redactLines(text, vault), EARLY_STEPS, vault);
    out = out.replace(URL_LIKE, (m) => this.#redactUrl(m, vault));
    out = this.#applySteps(out, LATE_STEPS, vault);
    return { redactedText: name === null ? out : this.#redactName(out, name, vault), vault };
  }

  #applySteps(text: string, steps: readonly PatternStep[], vault: RedactionVault): string {
    return steps.reduce(
      (out, { re, kind, accept }) =>
        out.replace(re, (m) =>
          accept === undefined || accept(m) ? vault.placeholderFor(kind, m) : m,
        ),
      text,
    );
  }

  /** Whole-line redaction: personal-detail lines and (possibly multi-line) addresses. */
  #redactLines(text: string, vault: RedactionVault): string {
    let previousWasAddress = false;
    return text
      .split('\n')
      .map((line) => {
        if (PERSONAL_LABEL.test(line)) return vault.placeholderFor('PERSONAL', line.trim());
        const hasPin = PIN_CODE.test(line);
        const isAddress =
          ADDRESS_LABEL.test(line) ||
          (hasPin && (ADDRESS_WORD.test(line) || PIN_AFTER_SEPARATOR.test(line))) ||
          (previousWasAddress && hasPin);
        previousWasAddress = isAddress;
        return isAddress ? vault.placeholderFor('ADDRESS', line.trim()) : line;
      })
      .join('\n');
  }

  #redactUrl(match: string, vault: RedactionVault): string {
    const trailing = /[.,;:!?]+$/.exec(match)?.[0] ?? '';
    const url = match.slice(0, match.length - trailing.length);
    return `${vault.placeholderFor('LINK', url)}${trailing}`;
  }

  /**
   * The candidate's name: a "Name:" label near the top, else the first of the top three lines
   * that looks like a name (headings and job titles such as "Software Engineer" are skipped).
   */
  #findName(text: string): string | null {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 5);
    for (const line of lines) {
      const labelled = NAME_LABEL.exec(line)?.[1]?.trim();
      if (labelled !== undefined && NAME_LINE.test(labelled)) return labelled;
    }
    const looksLikeName = (l: string, index: number): boolean =>
      l.length <= 40 &&
      NAME_LINE.test(l) &&
      !NOT_A_NAME.test(l) &&
      l.replace(/[^\p{L}]/gu, '').length >= 3 &&
      (index === 0 || l.split(/\s+/).length >= 2);
    for (const [index, line] of lines.slice(0, 3).entries()) {
      if (SECTION_HEADING.test(line)) return null;
      if (looksLikeName(line, index)) return line;
    }
    return null;
  }

  /**
   * The full name (any case) becomes [NAME]; other mentions of a name part become [NAME_n].
   * Parts match case-sensitively so "Ram" doesn't eat "8GB RAM".
   */
  #redactName(text: string, name: string, vault: RedactionVault): string {
    const parts = name.split(/\s+/).filter((p) => !HONORIFIC.test(p));
    const fullName = new RegExp(parts.map((p) => p.replace(/\./g, '\\.')).join('[ \\t]+'), 'giu');
    const asWritten = text.match(fullName)?.[0] ?? name;
    let out = text.replace(fullName, vault.placeholderFor('NAME', asWritten));
    for (const part of parts.filter((p) => p.replace(/[.'-]/g, '').length >= 3)) {
      const re = new RegExp(
        `(?<![\\p{L}\\p{N}])${part.replace(/\./g, '\\.')}(?![\\p{L}\\p{N}])`,
        'gu',
      );
      out = out.replace(re, vault.placeholderFor('NAME', part, true));
    }
    return out;
  }
}
