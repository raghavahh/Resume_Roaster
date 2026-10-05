import type { CheckResult, ResumeRule } from './checks';
import type { ResumeFacts, SectionKey } from './facts';

function indexOf(facts: ResumeFacts, key: SectionKey): number {
  return facts.sections.indexOf(key);
}

export class ObjectiveRule implements ResumeRule {
  public readonly id = 'objective';

  public check(facts: ResumeFacts): CheckResult {
    const has = facts.sections.includes('objective');
    return {
      id: this.id,
      status: has ? 'warn' : 'pass',
      title: has ? 'Old-style "Objective"' : 'No generic objective',
      detail: has
        ? 'Swap the Objective for a 2-line Summary: who you are, your best proof, the role you want.'
        : 'Good: no "seeking a challenging position" filler.',
      examples: [],
    };
  }
}

const DECLARATION = /\b(?:i\s+hereby\s+declare|declaration)\b/i;

export class DeclarationRule implements ResumeRule {
  public readonly id = 'declaration';

  public check(facts: ResumeFacts): CheckResult {
    const has = facts.sections.includes('declaration') || DECLARATION.test(facts.text);
    return {
      id: this.id,
      status: has ? 'warn' : 'pass',
      title: has ? 'Remove the declaration' : 'No declaration',
      detail: has
        ? '"I hereby declare…" wastes space; no recruiter reads it. Delete it and the signature line.'
        : 'Good: no declaration block.',
      examples: [],
    };
  }
}

export class SectionOrderRule implements ResumeRule {
  public readonly id = 'order';

  public check(facts: ResumeFacts): CheckResult {
    const education = indexOf(facts, 'education');
    const experience = indexOf(facts, 'experience');
    const projects = indexOf(facts, 'projects');
    const hobbies = indexOf(facts, 'hobbies');
    let problem: string | null = null;
    if (facts.mode !== 'fresher' && experience >= 0 && education >= 0 && education < experience) {
      problem = 'Put Experience above Education: your work is the stronger proof now.';
    } else if (hobbies >= 0 && projects >= 0 && hobbies < projects) {
      problem = 'Projects should come before Hobbies.';
    }
    return {
      id: this.id,
      status: problem === null ? 'pass' : 'warn',
      title: problem === null ? 'Sensible section order' : 'Strongest sections are buried',
      detail: problem ?? 'Your strongest sections come first.',
      examples: [],
    };
  }
}

/** India-specific: DOB, gender, religion, father's name and full addresses invite bias. */
export class PersonalDetailsRule implements ResumeRule {
  public readonly id = 'personal';

  public check(facts: ResumeFacts): CheckResult {
    const personal = (facts.text.match(/\[PERSONAL_\d+\]/g) ?? []).length;
    const addresses = (facts.text.match(/\[ADDRESS_\d+\]/g) ?? []).length;
    const found: string[] = [];
    if (personal > 0 || facts.sections.includes('personal')) {
      found.push('Personal details (DOB, gender, religion, family, etc.)');
    }
    if (addresses > 0) found.push('Full home address');
    return {
      id: this.id,
      status: found.length === 0 ? 'pass' : 'warn',
      title: found.length === 0 ? 'No unnecessary personal details' : 'Personal details to remove',
      detail:
        found.length === 0
          ? 'Good: nothing that invites bias.'
          : 'Recruiters don’t need these and they invite bias. City and state are enough.',
      examples: found,
    };
  }
}

export class ContactRule implements ResumeRule {
  public readonly id = 'contact';

  public check(facts: ResumeFacts): CheckResult {
    const missing: string[] = [];
    if (!/\[EMAIL_\d+\]/.test(facts.text)) missing.push('Email');
    if (!/\[PHONE_\d+\]/.test(facts.text)) missing.push('Phone');
    if (!/\[LINK_\d+\]/.test(facts.text)) missing.push('LinkedIn or GitHub link');
    const hardMissing = missing.filter((m) => m !== 'LinkedIn or GitHub link');
    return {
      id: this.id,
      status: hardMissing.length > 0 ? 'fail' : missing.length > 0 ? 'warn' : 'pass',
      title: missing.length === 0 ? 'Contact details present' : 'Contact details missing',
      detail:
        'A recruiter must be able to reach you in one glance: email, phone and one profile link.',
      examples: missing,
    };
  }
}
