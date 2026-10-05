import type { RoastMode } from '../contract/roast';

export const SECTION_KEYS = [
  'summary',
  'objective',
  'education',
  'experience',
  'projects',
  'skills',
  'certifications',
  'achievements',
  'hobbies',
  'personal',
  'declaration',
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** First match wins, so more specific patterns come first. */
const SECTION_PATTERNS: readonly (readonly [SectionKey, RegExp])[] = [
  ['objective', /\bobjective\b/i],
  ['declaration', /\bdeclaration\b/i],
  ['personal', /\bpersonal\s+(?:details|information|profile)\b/i],
  ['summary', /\b(?:summary|profile|about\s+me)\b/i],
  ['education', /\b(?:education|academic|qualifications?)\b/i],
  ['experience', /\b(?:experience|employment|work\s+history|internships?)\b/i],
  ['projects', /\bprojects?\b/i],
  ['skills', /\b(?:skills|technical|tech\s+stack|tools)\b/i],
  ['certifications', /\b(?:certifications?|courses?)\b/i],
  [
    'achievements',
    /\b(?:achievements?|awards?|accomplishments?|extra[\s-]?curricular|positions?\s+of\s+responsibility|leadership)\b/i,
  ],
  ['hobbies', /\b(?:hobbies|interests)\b/i],
];

const BULLET = /^\s*(?:[-*•▪●◦–]|\d{1,2}[.)])\s+/;

export interface ResumeFacts {
  readonly text: string;
  readonly lines: readonly string[];
  /** Bullet lines with the marker removed. */
  readonly bullets: readonly string[];
  readonly words: number;
  /** Sections in the order they appear. */
  readonly sections: readonly SectionKey[];
  readonly mode: RoastMode;
  readonly pageCount: number | null;
}

function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim();
  if (BULLET.test(line) || trimmed.length === 0 || trimmed.length > 40) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  const letters = trimmed.replace(/[^A-Za-z]/g, '');
  const isUpper = letters.length > 0 && letters === letters.toUpperCase();
  return isUpper || trimmed.endsWith(':') || trimmed.split(/\s+/).length <= 4;
}

function sectionOf(line: string): SectionKey | null {
  if (!looksLikeHeading(line)) return null;
  const heading = line.trim().replace(/:$/, '');
  return SECTION_PATTERNS.find(([, pattern]) => pattern.test(heading))?.[0] ?? null;
}

export function extractFacts(
  text: string,
  mode: RoastMode,
  pageCount: number | null = null,
): ResumeFacts {
  const lines = text.split('\n');
  const bullets = lines.filter((l) => BULLET.test(l)).map((l) => l.replace(BULLET, '').trim());
  const sections: SectionKey[] = [];
  for (const line of lines) {
    const key = sectionOf(line);
    if (key !== null && !sections.includes(key)) sections.push(key);
  }
  const words = text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  return { text, lines, bullets, words, sections, mode, pageCount };
}
