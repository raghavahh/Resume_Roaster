import { describe, expect, it } from 'vitest';
import {
  extractFacts,
  ResumeRulesEngine,
  type CheckResult,
  type CheckStatus,
  type RoastMode,
} from '../src';

const engine = new ResumeRulesEngine();

const goodBullets = Array.from(
  { length: 30 },
  (_, i) =>
    `- Shipped feature ${String(i + 1)} used by ${String(100 + i)} students across 3 campuses`,
);

/** A synthetic, already-redacted fresher resume that passes every check. */
const GOOD = [
  '[NAME]',
  '[EMAIL_1] | [PHONE_1] | [LINK_1]',
  '',
  'SUMMARY',
  'Final-year CSE student who ships backend projects.',
  '',
  'EDUCATION',
  'B.Tech CSE, Example Institute, 2022-2026, CGPA 8.4',
  '',
  'PROJECTS',
  ...goodBullets,
  '',
  'SKILLS',
  'Java, Python, SQL, React',
].join('\n');

function run(text: string, mode: RoastMode = 'fresher', pageCount: number | null = null) {
  const report = engine.analyze(text, { mode, pageCount });
  const byId = new Map(report.checks.map((c) => [c.id, c]));
  const get = (id: string): CheckResult => {
    const check = byId.get(id);
    if (check === undefined) throw new Error(`no check ${id}`);
    return check;
  };
  return { report, get, status: (id: string): CheckStatus => get(id).status };
}

describe('extractFacts', () => {
  it('finds headings in several styles and ignores bullets and sentences', () => {
    const facts = extractFacts(
      [
        'EDUCATION',
        'Work Experience:',
        '- Python tools',
        '1. Built projects',
        'I worked on many projects in college.',
        'A very long line that mentions skills but is clearly not a heading at all',
        'Technical Skills',
      ].join('\n'),
      'general',
    );
    expect(facts.sections).toEqual(['education', 'experience', 'skills']);
    expect(facts.bullets).toEqual(['Python tools', 'Built projects']);
  });

  it('records each section once and counts words', () => {
    const facts = extractFacts('SKILLS\nJava\nSKILLS\nGo', 'general', 2);
    expect(facts.sections).toEqual(['skills']);
    expect(facts.words).toBe(4);
    expect(facts.pageCount).toBe(2);
  });
});

describe('ResumeRulesEngine', () => {
  it('passes a strong resume on every check', () => {
    const { report } = run(GOOD, 'fresher', 1);
    expect(report.checks.filter((c) => c.status !== 'pass')).toEqual([]);
    expect(report.quickScore).toBe(100);
    expect(report.stats.bullets).toBe(30);
    expect(report.stats.sections).toEqual(['summary', 'education', 'projects', 'skills']);
  });

  it('lists failures first and lowers the score', () => {
    const { report } = run('just a few words about me', 'general');
    expect(report.checks[0]?.status).toBe('fail');
    const statuses = report.checks.map((c) => c.status);
    expect(statuses.indexOf('pass')).toBeGreaterThan(statuses.lastIndexOf('fail'));
    expect(report.quickScore).toBeLessThan(50);
    expect(report.quickScore).toBeGreaterThanOrEqual(0);
  });

  it('accepts custom rules (open/closed)', () => {
    const custom = new ResumeRulesEngine([
      {
        id: 'always',
        check: () => ({ id: 'always', status: 'warn', title: 't', detail: 'd', examples: [] }),
      },
    ]);
    expect(custom.analyze('x', { mode: 'general' }).quickScore).toBe(94);
  });
});

describe('content checks', () => {
  it('flags buzzwords: a few warn, many fail', () => {
    expect(run(`${GOOD}\nHardworking team player`).status('buzzwords')).toBe('warn');
    const many = `${GOOD}\nHardworking, passionate, dynamic team player`;
    expect(run(many).get('buzzwords').examples).toHaveLength(4);
    expect(run(many).status('buzzwords')).toBe('fail');
  });

  it('measures quantified bullets', () => {
    const vague = Array.from({ length: 4 }, () => '- Worked with the team on things');
    expect(run([...vague, '- Cut costs by 10%'].join('\n')).status('numbers')).toBe('fail');
    expect(run([...vague.slice(0, 2), '- Cut 10%'].join('\n')).status('numbers')).toBe('warn');
    expect(run('No bullets here').get('numbers').title).toBe('No bullet points');
  });

  it('flags weak opening verbs', () => {
    expect(run('- Responsible for testing').status('weak-verbs')).toBe('warn');
    const weak = ['- Helped a team', '- Assisted seniors', '- Worked on APIs'].join('\n');
    expect(run(weak).status('weak-verbs')).toBe('fail');
  });

  it('flags first-person bullets', () => {
    expect(run('- I built a bot\n- Built my portfolio').get('pronouns').examples).toHaveLength(2);
  });

  it('checks length for freshers and experienced people', () => {
    const words = (n: number): string => Array.from({ length: n }, () => 'word').join(' ');
    expect(run(words(100)).status('length')).toBe('fail');
    expect(run(words(200)).status('length')).toBe('warn');
    expect(run(words(700)).status('length')).toBe('warn');
    expect(run(words(900)).status('length')).toBe('fail');
    expect(run(words(800), 'switcher').status('length')).toBe('pass');
  });

  it('checks page count when known', () => {
    expect(run(GOOD, 'fresher', null).get('pages').title).toBe('Pages not checked');
    expect(run(GOOD, 'fresher', 2).status('pages')).toBe('warn');
    expect(run(GOOD, 'fresher', 3).status('pages')).toBe('fail');
    expect(run(GOOD, 'switcher', 2).get('pages').title).toBe('2 pages');
  });

  it('requires core sections', () => {
    const { get } = run('SUMMARY\nHello');
    expect(get('sections').status).toBe('fail');
    expect(get('sections').examples).toEqual(['Education', 'Skills', 'Experience or Projects']);
  });
});

describe('structure checks', () => {
  it('flags an objective and a declaration', () => {
    const text = `${GOOD}\n\nCAREER OBJECTIVE\nSeeking a role\n\nDECLARATION\nI hereby declare all true.`;
    expect(run(text).status('objective')).toBe('warn');
    expect(run(text).status('declaration')).toBe('warn');
  });

  it('wants experience above education for experienced people', () => {
    const text = 'EDUCATION\nB.Tech\nEXPERIENCE\n- Built X';
    expect(run(text, 'switcher').status('order')).toBe('warn');
    expect(run(text, 'fresher').status('order')).toBe('pass');
    expect(run('HOBBIES\nChess\nPROJECTS\n- Built X').status('order')).toBe('warn');
  });

  it('flags personal details and full addresses (India-specific)', () => {
    const { get } = run(`${GOOD}\n[PERSONAL_1]\n[ADDRESS_1]`);
    expect(get('personal').status).toBe('warn');
    expect(get('personal').examples).toHaveLength(2);
    expect(run(`${GOOD}\nPERSONAL DETAILS\nNothing`).status('personal')).toBe('warn');
  });

  it('needs email and phone; a profile link is a nice-to-have', () => {
    expect(run('[NAME]\n[EMAIL_1]').status('contact')).toBe('fail');
    expect(run('[NAME]\n[EMAIL_1] [PHONE_1]').status('contact')).toBe('warn');
    expect(run('[NAME]\n[EMAIL_1] [PHONE_1] [LINK_1]').status('contact')).toBe('pass');
  });
});
