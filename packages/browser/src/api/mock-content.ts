import {
  ResumeRulesEngine,
  type AdminDailyRow,
  type AdminOverview,
  type CoverLetterResult,
  type InterviewQuestionsResult,
  type Language,
  type LinkedInResult,
  type ResumeDoc,
  type RoastLevel,
  type RoastProblem,
  type RoastRequest,
  type RoastResult,
  type TailorResult,
} from '@engine/domain';

/** Fake content for local development and UI tests. Never used in production builds. */

const SAVAGE: Readonly<Record<RoastLevel, Readonly<Record<Language, readonly string[]>>>> = {
  mild: {
    en: [
      'Solid start, but your bullets are whispering when they should be talking.',
      'Good bones. Now give the recruiter a reason to stop scrolling.',
    ],
    hinglish: [
      'Base theek hai, bas bullets thoda zyada shy hain.',
      'Potential hai boss, bas numbers daalna bhool gaye.',
    ],
  },
  spicy: {
    en: [
      'This resume has the energy of a forwarded WhatsApp message.',
      'Recruiters will skim this in six seconds and remember none of it.',
    ],
    hinglish: [
      'Yeh resume nahi, group project ka attendance sheet lag raha hai.',
      'Itne buzzwords, HR ko bingo khelne ka mann kar jayega.',
    ],
  },
  nuclear: {
    en: [
      'An ATS read this and quietly filed it under "maybe never".',
      'Your resume lists duties like a job description nobody asked for.',
    ],
    hinglish: [
      'ATS ne padha, chai pi, aur reject kar diya.',
      'Responsibilities ki list hai, achievements ka pata nahi.',
    ],
  },
};

const GENERIC_PROBLEMS: readonly RoastProblem[] = [
  {
    title: 'No measurable results',
    detail: 'Bullets describe tasks, not outcomes, so impact is invisible.',
    fix: 'Add one number per bullet: users, %, time saved, rank or scale.',
  },
  {
    title: 'Generic summary',
    detail: 'The top of the page could belong to anyone in your batch.',
    fix: 'Write two lines: who you are, your best proof, and the role you want.',
  },
  {
    title: 'Skills without proof',
    detail: 'Skills are listed but never shown in a project or role.',
    fix: 'Mention each key skill inside a bullet that shows it in use.',
  },
  {
    title: 'Weak project titles',
    detail: 'Project names do not say what the project does or why it matters.',
    fix: 'Rename each project to say what it does, e.g. "Placement tracker for 1,200 students".',
  },
  {
    title: 'Missing keywords',
    detail: 'Terms recruiters search for in your target role are missing.',
    fix: 'Mirror the exact tools and skills named in the job posts you want.',
  },
];

/** Small deterministic hash so the same resume always gets the same fake score. */
export function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const clampScore = (n: number): number => Math.max(5, Math.min(95, Math.round(n)));

export function fakeRoast(request: RoastRequest): RoastResult {
  const report = new ResumeRulesEngine().analyze(request.text, { mode: request.mode });
  const h = hashText(request.text);
  const score = clampScore(report.quickScore * 0.8 + (h % 15));
  const fromChecks: RoastProblem[] = report.checks
    .filter((c) => c.status !== 'pass')
    .map((c) => ({
      title: c.title.slice(0, 80),
      detail: c.detail.slice(0, 300),
      fix: c.detail.slice(0, 300),
    }))
    .filter((p) => p.title.length >= 3 && p.detail.length >= 10);
  const problems = [...fromChecks, ...GENERIC_PROBLEMS].slice(0, 5);
  const lines = SAVAGE[request.level][request.language];
  const sub = (offset: number): number => clampScore(score + ((h >> offset) % 21) - 10);
  return {
    score,
    subScores: {
      impact: sub(1),
      clarity: sub(3),
      ats: sub(5),
      structure: sub(7),
      keywords: sub(9),
    },
    problems,
    savageLine: lines[h % lines.length] ?? 'Your resume needs work, and that is fixable.',
  };
}

export function fakeResumeDoc(targetRole = 'Software Engineer'): ResumeDoc {
  return {
    contact: { name: '[NAME]', lines: ['[EMAIL_1]', '[PHONE_1]', '[LINK_1]'] },
    headline: `${targetRole} | Backend, APIs and data`,
    summary:
      'Final-year CSE student who ships backend projects used by real users. Built a placement tracker used by 1,200 students and cut API latency by 40%.',
    sections: SAMPLE_SECTIONS,
    skills: ['Java', 'Spring Boot', 'SQL', 'PostgreSQL', 'REST APIs', 'Git'],
  };
}

const SAMPLE_SECTIONS: ResumeDoc['sections'] = [
  {
    title: 'Projects',
    entries: [
      {
        heading: 'Placement Tracker',
        subheading: 'Java, Spring Boot, PostgreSQL',
        dates: '2025',
        bullets: [
          'Built a placement tracker used by 1,200 students across 3 departments.',
          'Cut manual coordinator work by 40% by automating eligibility checks.',
        ],
      },
    ],
  },
  {
    title: 'Education',
    entries: [
      {
        heading: 'B.Tech, Computer Science',
        subheading: 'Example Institute of Technology',
        dates: '2022 - 2026',
        bullets: ['CGPA 8.4/10'],
      },
    ],
  },
];

export function fakeTailor(): TailorResult {
  return { matchPct: 72, missing: ['Docker', 'Kubernetes', 'CI/CD'], resume: fakeResumeDoc() };
}

export function fakeCoverLetter(): CoverLetterResult {
  const letter = [
    'Dear Hiring Manager,',
    '',
    'I am applying for the backend intern role. At college I built a placement tracker used by 1,200 students, and automating eligibility checks cut manual work by 40%.',
    'I enjoy turning messy processes into simple tools, and your team’s focus on reliable APIs is exactly where I want to grow.',
    '',
    'Regards,',
    '[NAME]',
  ].join('\n');
  return { letter };
}

export function fakeLinkedIn(): LinkedInResult {
  return {
    headline:
      'Backend developer in the making | Java, Spring Boot, SQL | Built tools used by 1,200+ students',
    about:
      'I build backend tools that remove busywork. My placement tracker is used by 1,200 students and cut coordinator effort by 40%. I am looking for backend internships where I can ship reliable APIs and learn from strong engineers.',
  };
}

export function fakeInterviewQuestions(): InterviewQuestionsResult {
  const questions = Array.from({ length: 20 }, (_, i) => ({
    question: `Question ${String(i + 1)}: walk me through a decision you made in your placement tracker.`,
    tip: 'Answer with the situation, your choice, the trade-off and the measurable result.',
  }));
  return { questions };
}

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
const QUICK_FIX_PAISE = 9_900;

function fakeDaily(days: number, now: Date): AdminDailyRow[] {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(now.getTime() - (days - 1 - i) * 86_400_000);
    const seed = hashText(isoDay(date));
    const paidOrders = seed % 4;
    return {
      date: isoDay(date),
      signups: 5 + (seed % 12),
      activeUsers: 15 + (seed % 30),
      roasts: 40 + (seed % 60),
      paidGenerations: paidOrders * 3,
      paidOrders,
      revenuePaise: paidOrders * QUICK_FIX_PAISE,
    };
  });
}

type Summable = 'signups' | 'roasts' | 'paidOrders' | 'revenuePaise' | 'paidGenerations';

function fakeTotals(daily: readonly AdminDailyRow[]): AdminOverview['totals'] {
  const sum = (key: Summable): number => daily.reduce((total, row) => total + row[key], 0);
  const paidOrders = sum('paidOrders');
  return {
    users: 420,
    signups: sum('signups'),
    activeUsers: Math.round(sum('signups') * 1.8),
    roasts: sum('roasts'),
    anonymousRoasts: Math.round(sum('roasts') * 0.4),
    paidGenerations: sum('paidGenerations'),
    ordersCreated: paidOrders + 6,
    paidOrders,
    payingUsers: Math.max(0, paidOrders - 2),
    revenuePaise: sum('revenuePaise'),
    refunds: 1,
    refundedPaise: QUICK_FIX_PAISE,
    soldOutDays: 0,
  };
}

export function fakeAdminOverview(days: number, now: Date): AdminOverview {
  const daily = fakeDaily(days, now);
  const totals = fakeTotals(daily);
  const order = { orderId: 'order_MOCK0001', packId: 'quick_fix', amountPaise: QUICK_FIX_PAISE };
  return {
    generatedAt: now.toISOString(),
    range: { from: daily[0]?.date ?? isoDay(now), to: isoDay(now), days },
    totals,
    conversion: { signupToPaidPct: 3.2, checkoutToPaidPct: 61.5 },
    events: [
      { event: 'pricing_viewed', count: 310 },
      { event: 'paywall_viewed', count: 205 },
      { event: 'checkout_started', count: totals.ordersCreated },
      { event: 'card_downloaded', count: 140 },
      { event: 'card_shared', count: 88 },
      { event: 'pdf_downloaded', count: totals.paidOrders * 2 },
    ],
    daily,
    salesByPack: [
      { packId: 'quick_fix', orders: totals.paidOrders, revenuePaise: totals.revenuePaise },
    ],
    aiUsage: [
      { provider: 'groq', tier: 'free', calls: totals.roasts },
      { provider: 'gemini', tier: 'paid', calls: totals.paidGenerations },
    ],
    recentOrders: [{ ...order, status: 'paid', createdAt: now.toISOString() }],
  };
}
