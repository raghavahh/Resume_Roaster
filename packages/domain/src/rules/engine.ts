import type { RoastMode } from '../contract/roast';
import {
  BuzzwordRule,
  LengthRule,
  PageCountRule,
  PronounRule,
  QuantifiedBulletsRule,
  RequiredSectionsRule,
  WeakVerbRule,
  type CheckResult,
  type ResumeRule,
} from './checks';
import { extractFacts, type SectionKey } from './facts';
import {
  ContactRule,
  DeclarationRule,
  ObjectiveRule,
  PersonalDetailsRule,
  SectionOrderRule,
} from './structure-checks';

export const DEFAULT_RULES: readonly ResumeRule[] = Object.freeze([
  new ContactRule(),
  new RequiredSectionsRule(),
  new QuantifiedBulletsRule(),
  new WeakVerbRule(),
  new BuzzwordRule(),
  new LengthRule(),
  new PageCountRule(),
  new PersonalDetailsRule(),
  new DeclarationRule(),
  new ObjectiveRule(),
  new SectionOrderRule(),
  new PronounRule(),
]);

const FAIL_PENALTY = 15;
const WARN_PENALTY = 6;

export interface RulesReport {
  readonly checks: readonly CheckResult[];
  /** A rough 0-100 score from the instant checks only; the AI roast gives the real score. */
  readonly quickScore: number;
  readonly stats: {
    readonly words: number;
    readonly bullets: number;
    readonly sections: readonly SectionKey[];
  };
}

export interface AnalyzeOptions {
  readonly mode: RoastMode;
  /** Known for uploaded PDFs; null for pasted text. */
  readonly pageCount?: number | null;
}

/**
 * The free, unlimited instant checks (PRD A5). Runs on REDACTED text, so contact checks look
 * for placeholders, never real values. Fails first, then warnings, then passes.
 */
export class ResumeRulesEngine {
  readonly #rules: readonly ResumeRule[];

  constructor(rules: readonly ResumeRule[] = DEFAULT_RULES) {
    this.#rules = rules;
  }

  public analyze(redactedText: string, options: AnalyzeOptions): RulesReport {
    const facts = extractFacts(redactedText, options.mode, options.pageCount ?? null);
    const rank = { fail: 0, warn: 1, pass: 2 } as const;
    const checks = this.#rules
      .map((rule) => rule.check(facts))
      .toSorted((a, b) => rank[a.status] - rank[b.status]);
    const penalty = checks.reduce(
      (sum, c) =>
        sum + (c.status === 'fail' ? FAIL_PENALTY : c.status === 'warn' ? WARN_PENALTY : 0),
      0,
    );
    return {
      checks,
      quickScore: Math.max(0, 100 - penalty),
      stats: { words: facts.words, bullets: facts.bullets.length, sections: facts.sections },
    };
  }
}
