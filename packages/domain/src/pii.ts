/**
 * Removes personal details from resume text before it leaves the device (PRD Flow 1 step 2),
 * and again on the server (belt and braces). Pure: no DOM, no I/O.
 */

export const PLACEHOLDER_KINDS = ['EMAIL', 'PHONE', 'LINK', 'ADDRESS', 'ID', 'PERSONAL'] as const;
type PlaceholderKind = (typeof PLACEHOLDER_KINDS)[number];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const URL_LIKE =
  /\b(?:https?:\/\/|www\.)[^\s<>"'()]+|\b(?:linkedin\.com|github\.com|gitlab\.com|leetcode\.com|kaggle\.com|behance\.net|dribbble\.com|medium\.com|hackerrank\.com|codechef\.com|codeforces\.com|bit\.ly)\/[^\s<>"'()]*/gi;
const PHONE_CANDIDATE = /(?<![\w+])\+?\d[\d\s().-]{8,16}\d(?!\w)/g;
const AADHAAR = /\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b/g;
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const PIN_CODE = /\b[1-9]\d{2}\s?\d{3}\b/;
const ADDRESS_HINT =
  /,|\b(?:road|rd|street|st|nagar|colony|sector|flat|house|h\.?no|dist|district|near|lane|apartment|apts?|block|phase|layout|village|mandal|taluk|post)\b/i;
const ADDRESS_LABEL = /^\s*(?:permanent\s+|current\s+|residential\s+)?address\s*[:\-–]/i;
const PERSONAL_LABEL =
  /^\s*(?:date\s+of\s+birth|d\.?\s?o\.?\s?b\.?|gender|sex|marital\s+status|religion|caste|category|nationality|father'?s?\s+name|mother'?s?\s+name|spouse(?:'s)?\s+name|age|languages?\s+known|blood\s+group|passport(?:\s+no\.?)?|hobbies)\s*[:\-–]/i;
const NAME_LABEL = /^\s*(?:full\s+)?name\s*[:\-–]\s*(.+)$/i;
const NAME_LINE = /^[A-Za-z][A-Za-z.'-]*(?: [A-Za-z][A-Za-z.'-]*){1,3}$/;
const NOT_A_NAME =
  /\b(?:resume|curriculum|vitae|cv|profile|summary|objective|education|experience|skills)\b/i;
const PLACEHOLDER =
  /\[\s*(FIRST[\s_-]?NAME|NAME|EMAIL|PHONE|LINK|ADDRESS|ID|PERSONAL)(?:[\s_-]*(\d+))?\s*\]/gi;

type NameKind = 'NAME' | 'FIRST_NAME';

function canonical(kind: string, n: string | undefined): string {
  const k = kind.toUpperCase().replace(/^FIRST[\s_-]?NAME$/, 'FIRST_NAME');
  return n === undefined ? `[${k}]` : `[${k}_${n}]`;
}

/** The real values behind placeholders. Lives only in memory; never serialises. */
export class RedactionVault {
  readonly #byPlaceholder = new Map<string, string>();
  readonly #byValue = new Map<string, string>();
  readonly #counters = new Map<PlaceholderKind, number>();

  /** Returns the placeholder for a value, reusing it if the value was seen before. */
  public placeholderFor(kind: PlaceholderKind | NameKind, value: string): string {
    const key = `${kind}:${value}`;
    const existing = this.#byValue.get(key);
    if (existing !== undefined) return existing;
    const placeholder = kind === 'NAME' || kind === 'FIRST_NAME' ? `[${kind}]` : this.#next(kind);
    this.#byValue.set(key, placeholder);
    this.#byPlaceholder.set(placeholder, value);
    return placeholder;
  }

  #next(kind: PlaceholderKind): string {
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

  /** Placeholders the vault holds that no longer appear in `text` (AM-16 survival check). */
  public missingIn(text: string): readonly string[] {
    const present = new Set<string>();
    for (const m of text.matchAll(PLACEHOLDER)) {
      present.add(canonical(m[1] ?? '', m[2]));
    }
    return this.placeholders().filter((p) => !present.has(p));
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

function digitCount(value: string): number {
  return value.replace(/\D/g, '').length;
}

export class PiiRedactor {
  /** Replaces personal details with placeholders. The vault must stay on this device. */
  public redact(text: string, vault: RedactionVault = new RedactionVault()): Redaction {
    const name = this.#findName(text);
    let out = text
      .split('\n')
      .map((line) => this.#redactLine(line, vault))
      .join('\n');
    out = out.replace(EMAIL, (m) => vault.placeholderFor('EMAIL', m));
    out = out.replace(URL_LIKE, (m) => this.#redactUrl(m, vault));
    out = out.replace(AADHAAR, (m) => vault.placeholderFor('ID', m));
    out = out.replace(PAN, (m) => vault.placeholderFor('ID', m));
    out = out.replace(PHONE_CANDIDATE, (m) => this.#redactPhone(m, vault));
    if (name !== null) out = this.#redactName(out, name, vault);
    return { redactedText: out, vault };
  }

  #redactLine(line: string, vault: RedactionVault): string {
    if (PERSONAL_LABEL.test(line)) return vault.placeholderFor('PERSONAL', line.trim());
    const isAddress = ADDRESS_LABEL.test(line) || (PIN_CODE.test(line) && ADDRESS_HINT.test(line));
    return isAddress ? vault.placeholderFor('ADDRESS', line.trim()) : line;
  }

  #redactUrl(match: string, vault: RedactionVault): string {
    const trailing = /[.,;:!?]+$/.exec(match)?.[0] ?? '';
    const url = match.slice(0, match.length - trailing.length);
    return `${vault.placeholderFor('LINK', url)}${trailing}`;
  }

  #redactPhone(match: string, vault: RedactionVault): string {
    const digits = digitCount(match);
    return digits >= 10 && digits <= 13 ? vault.placeholderFor('PHONE', match.trim()) : match;
  }

  #findName(text: string): string | null {
    const lines = text.split('\n').map((l) => l.trim());
    for (const line of lines) {
      const labelled = NAME_LABEL.exec(line)?.[1]?.trim();
      if (labelled !== undefined && NAME_LINE.test(labelled)) return labelled;
    }
    const first = lines.filter((l) => l.length > 0).slice(0, 3);
    return first.find((l) => l.length <= 40 && NAME_LINE.test(l) && !NOT_A_NAME.test(l)) ?? null;
  }

  #redactName(text: string, name: string, vault: RedactionVault): string {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    let out = text.replace(new RegExp(escaped, 'gi'), vault.placeholderFor('NAME', name));
    const firstName = name.split(/\s+/)[0] ?? '';
    if (firstName.length >= 3) {
      const pattern = new RegExp(`\\b${firstName.replace(/\./g, '\\.')}\\b`, 'g');
      out = out.replace(pattern, vault.placeholderFor('FIRST_NAME', firstName));
    }
    return out;
  }
}
