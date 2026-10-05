import type { ResumeFacts, SectionKey } from './facts';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckResult {
  readonly id: string;
  readonly status: CheckStatus;
  readonly title: string;
  readonly detail: string;
  readonly examples: readonly string[];
}

/** One instant check (PRD A5). Add a check by adding a class; the engine doesn't change. */
export interface ResumeRule {
  readonly id: string;
  check(facts: ResumeFacts): CheckResult;
}

export function clip(text: string, max = 80): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function by(count: number, warnUpTo: number): CheckStatus {
  if (count === 0) return 'pass';
  return count <= warnUpTo ? 'warn' : 'fail';
}

const BUZZWORDS = [
  'hardworking',
  'hard-working',
  'hard working',
  'team player',
  'go-getter',
  'synergy',
  'passionate',
  'dynamic',
  'detail-oriented',
  'self-motivated',
  'results-driven',
  'result-oriented',
  'think outside the box',
  'quick learner',
  'fast learner',
  'highly motivated',
  'proactive',
  'excellent communication skills',
  'good communication skills',
  'punctual',
  'sincere',
] as const;
const BUZZWORD_PATTERNS = BUZZWORDS.map((w) => [w, new RegExp(`\\b${w}\\b`, 'i')] as const);

export class BuzzwordRule implements ResumeRule {
  public readonly id = 'buzzwords';

  public check(facts: ResumeFacts): CheckResult {
    const found = BUZZWORD_PATTERNS.filter(([, re]) => re.test(facts.text)).map(([w]) => w);
    return {
      id: this.id,
      status: by(found.length, 2),
      title: found.length === 0 ? 'No empty buzzwords' : 'Buzzwords instead of proof',
      detail:
        found.length === 0
          ? 'You show qualities instead of claiming them. Good.'
          : 'Recruiters skip these. Replace each with one line of proof: what you did and the result.',
      examples: found,
    };
  }
}

const QUANTIFIED = /\d|%|₹|\brs\.?\s|\blakh|\bcrore/i;

export class QuantifiedBulletsRule implements ResumeRule {
  public readonly id = 'numbers';

  public check(facts: ResumeFacts): CheckResult {
    const { bullets } = facts;
    if (bullets.length === 0) {
      const detail = 'Use bullet points under each project or role; recruiters scan, not read.';
      return { id: this.id, status: 'fail', title: 'No bullet points', detail, examples: [] };
    }
    const vague = bullets.filter((b) => !QUANTIFIED.test(b));
    const ratio = 1 - vague.length / bullets.length;
    const pct = Math.round(ratio * 100);
    return {
      id: this.id,
      status: ratio >= 0.5 ? 'pass' : ratio >= 0.25 ? 'warn' : 'fail',
      title: `${String(pct)}% of bullets have a number`,
      detail: 'Aim for half or more. Add users, %, time saved, rank, marks or scale.',
      examples: vague.slice(0, 3).map((b) => clip(b)),
    };
  }
}

const WEAK_START =
  /^(?:responsible for|worked on|working on|helped|assisted|handled|involved in|participated in|was part of|tasked with|duties included|did)\b/i;

export class WeakVerbRule implements ResumeRule {
  public readonly id = 'weak-verbs';

  public check(facts: ResumeFacts): CheckResult {
    const weak = facts.bullets.filter((b) => WEAK_START.test(b));
    return {
      id: this.id,
      status: by(weak.length, 2),
      title: weak.length === 0 ? 'Strong opening verbs' : 'Bullets start with weak verbs',
      detail: 'Start with what you did: Built, Led, Cut, Shipped, Automated, Designed.',
      examples: weak.slice(0, 3).map((b) => clip(b)),
    };
  }
}

const PRONOUN = /(?:^|\s)(?:I|[Mm]y|[Mm]e|[Mm]yself)\b/;

export class PronounRule implements ResumeRule {
  public readonly id = 'pronouns';

  public check(facts: ResumeFacts): CheckResult {
    const hits = facts.bullets.filter((b) => PRONOUN.test(b));
    return {
      id: this.id,
      status: hits.length === 0 ? 'pass' : 'warn',
      title: hits.length === 0 ? 'No first-person bullets' : 'Bullets use "I" or "my"',
      detail: 'Drop the pronoun and start with the verb: "Built X", not "I built X".',
      examples: hits.slice(0, 3).map((b) => clip(b)),
    };
  }
}

export class LengthRule implements ResumeRule {
  public readonly id = 'length';

  public check(facts: ResumeFacts): CheckResult {
    const [min, max] = facts.mode === 'fresher' ? [250, 650] : [300, 900];
    const { words } = facts;
    let status: CheckStatus = 'pass';
    if (words < 150 || words > max * 1.3) status = 'fail';
    else if (words < min || words > max) status = 'warn';
    const advice =
      words < min ? 'Too thin: add projects with results.' : 'Cut anything older or weaker.';
    return {
      id: this.id,
      status,
      title: `${String(words)} words`,
      detail: status === 'pass' ? `Right length (aim for ${String(min)}–${String(max)}).` : advice,
      examples: [],
    };
  }
}

export class PageCountRule implements ResumeRule {
  public readonly id = 'pages';

  public check(facts: ResumeFacts): CheckResult {
    const pages = facts.pageCount;
    if (pages === null) {
      const detail = 'Pasted text, so page count was not checked.';
      return { id: this.id, status: 'pass', title: 'Pages not checked', detail, examples: [] };
    }
    const max = facts.mode === 'fresher' ? 1 : 2;
    return {
      id: this.id,
      status: pages <= max ? 'pass' : pages === max + 1 ? 'warn' : 'fail',
      title: `${String(pages)} page${pages === 1 ? '' : 's'}`,
      detail: `Keep it to ${String(max)} page${max === 1 ? '' : 's'} at this stage.`,
      examples: [],
    };
  }
}

export class RequiredSectionsRule implements ResumeRule {
  public readonly id = 'sections';

  public check(facts: ResumeFacts): CheckResult {
    const has = (k: SectionKey): boolean => facts.sections.includes(k);
    const missing: string[] = [];
    if (!has('education')) missing.push('Education');
    if (!has('skills')) missing.push('Skills');
    if (!has('experience') && !has('projects')) missing.push('Experience or Projects');
    return {
      id: this.id,
      status: missing.length === 0 ? 'pass' : 'fail',
      title: missing.length === 0 ? 'Core sections present' : 'Missing core sections',
      detail:
        'ATS and recruiters look for clear Education, Skills and Experience/Projects headings.',
      examples: missing,
    };
  }
}
