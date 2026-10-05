import { describe, expect, it } from 'vitest';
import {
  AdminOverviewQuerySchema,
  AnalyticsEventSchema,
  CreditBalanceSchema,
  DeleteAccountRequestSchema,
  ErrorEnvelopeSchema,
  LIMITS,
  OrderRequestSchema,
  RoastRequestSchema,
  RoastResultSchema,
  TailorRequestSchema,
  VerifyRequestSchema,
  normaliseText,
  paidResponseSchema,
  RewriteResultSchema,
} from '../src';

const RESUME = 'Synthetic Candidate\nB.Tech CSE 2026\n'.padEnd(400, ' Built a project. ');

const roast = { text: RESUME, level: 'spicy', language: 'en', mode: 'fresher' };

describe('normaliseText', () => {
  it('strips invisible, bidi and control characters', () => {
    expect(normaliseText('a\u200Bb\u202Ec\u0007d\uFEFF')).toBe('abcd');
  });

  it('unifies newlines, keeps tabs, applies NFC and trims', () => {
    expect(normaliseText('  x\r\ny\rz\tw  ')).toBe('x\ny\nz\tw');
    expect(normaliseText('cafe\u0301')).toBe('caf\u00e9');
  });
});

describe('RoastRequestSchema', () => {
  it('accepts a valid request and normalises the text', () => {
    const parsed = RoastRequestSchema.parse({ ...roast, text: `\u200B${RESUME}` });
    expect(parsed.text.startsWith('Synthetic')).toBe(true);
  });

  it('rejects unknown keys such as userId (S-03)', () => {
    expect(RoastRequestSchema.safeParse({ ...roast, userId: 'someone-else' }).success).toBe(false);
  });

  it('rejects text over the 12,000-character limit (F-04)', () => {
    const tooLong = 'a'.repeat(LIMITS.resumeMaxChars + 1);
    const result = RoastRequestSchema.safeParse({ ...roast, text: tooLong });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('12000');
  });

  it('counts the limit after invisible characters are removed', () => {
    const padded = `${'a'.repeat(LIMITS.resumeMaxChars)}${'\u200B'.repeat(50)}`;
    expect(RoastRequestSchema.safeParse({ ...roast, text: padded }).success).toBe(true);
  });

  it('rejects text that is too short and unknown levels', () => {
    expect(RoastRequestSchema.safeParse({ ...roast, text: 'hi' }).success).toBe(false);
    expect(RoastRequestSchema.safeParse({ ...roast, level: 'brutal' }).success).toBe(false);
  });
});

describe('RoastResultSchema', () => {
  const problem = {
    title: 'No numbers',
    detail: 'Bullets list duties, not results.',
    fix: 'Add one number per bullet.',
  };
  const result = {
    score: 42,
    subScores: { impact: 30, clarity: 50, ats: 60, structure: 40, keywords: 35 },
    problems: [problem, problem, problem, problem, problem],
    savageLine: 'This resume has the energy of a forwarded WhatsApp message.',
  };

  it('accepts exactly five problems, each with a fix', () => {
    expect(RoastResultSchema.safeParse(result).success).toBe(true);
    expect(RoastResultSchema.safeParse({ ...result, problems: [problem] }).success).toBe(false);
    const noFix = { ...problem, fix: '' };
    const bad = { ...result, problems: [noFix, problem, problem, problem, problem] };
    expect(RoastResultSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects scores outside 0-100 or fractional', () => {
    expect(RoastResultSchema.safeParse({ ...result, score: 101 }).success).toBe(false);
    expect(RoastResultSchema.safeParse({ ...result, score: 4.5 }).success).toBe(false);
  });
});

describe('payment schemas', () => {
  it('rejects a client-sent amount (S-05)', () => {
    const body = { product: 'roaster', packId: 'quick_fix' };
    expect(OrderRequestSchema.safeParse(body).success).toBe(true);
    expect(OrderRequestSchema.safeParse({ ...body, amount: 1 }).success).toBe(false);
    expect(OrderRequestSchema.safeParse({ ...body, packId: 'DROP TABLE' }).success).toBe(false);
  });

  it('only accepts Razorpay-shaped ids and a hex signature', () => {
    const ok = {
      orderId: 'order_ABC123def',
      paymentId: 'pay_XYZ789abc',
      signature: 'a'.repeat(64),
    };
    expect(VerifyRequestSchema.safeParse(ok).success).toBe(true);
    expect(VerifyRequestSchema.safeParse({ ...ok, signature: 'zz' }).success).toBe(false);
    expect(VerifyRequestSchema.safeParse({ ...ok, orderId: 'pay_ABC123def' }).success).toBe(false);
  });

  it('wraps paid results with server-side credit balances', () => {
    const schema = paidResponseSchema(RewriteResultSchema);
    const credits = [{ kind: 'rewrite', remaining: 0, expiresAt: null, packId: 'quick_fix' }];
    expect(schema.shape.credits.parse(credits)).toEqual(credits);
    expect(CreditBalanceSchema.safeParse({ ...credits[0], remaining: -1 }).success).toBe(false);
  });
});

describe('other schemas', () => {
  it('requires a job post for tailoring', () => {
    expect(TailorRequestSchema.safeParse({ text: RESUME }).success).toBe(false);
  });

  it('requires typing DELETE to delete an account', () => {
    expect(DeleteAccountRequestSchema.safeParse({ confirm: 'DELETE' }).success).toBe(true);
    expect(DeleteAccountRequestSchema.safeParse({ confirm: 'delete' }).success).toBe(false);
  });

  it('only accepts known, identifier-free analytics events', () => {
    const ok = { event: 'card_shared', product: 'roaster' };
    expect(AnalyticsEventSchema.safeParse(ok).success).toBe(true);
    expect(AnalyticsEventSchema.safeParse({ ...ok, event: 'mined_bitcoin' }).success).toBe(false);
    expect(AnalyticsEventSchema.safeParse({ ...ok, userId: 'u1' }).success).toBe(false);
  });

  it('parses the admin range, defaulting to 30 days', () => {
    expect(AdminOverviewQuerySchema.parse({}).days).toBe(30);
    expect(AdminOverviewQuerySchema.parse({ days: '7' }).days).toBe(7);
    expect(AdminOverviewQuerySchema.safeParse({ days: '365' }).success).toBe(false);
  });

  it('describes the single error shape', () => {
    const envelope = { error: { code: 'NO_CREDITS', message: 'Out of credits', requestId: 'r1' } };
    expect(ErrorEnvelopeSchema.parse(envelope)).toEqual(envelope);
    const unknown = { error: { ...envelope.error, code: 'TEAPOT' } };
    expect(ErrorEnvelopeSchema.safeParse(unknown).success).toBe(false);
  });
});
