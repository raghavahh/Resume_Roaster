import { describe, expect, it } from 'vitest';
import { normaliseText, PiiRedactor, RedactionVault } from '../src';

// Entirely synthetic. No real person.
const RESUME = [
  'Aarav Testkumar',
  'aarav.test@example.com | +91 98765 43210 | linkedin.com/in/aarav-test | https://github.com/aaravtest.',
  'Address: Flat 4B, Example Residency, Test Nagar, Hyderabad 500001',
  '',
  'EDUCATION',
  'B.Tech CSE, Example Institute of Technology, 2022-2026, CGPA 8.4',
  '',
  'PROJECTS',
  '- Built a placement tracker used by 1200 students; cut manual work by 40%',
  '- Aarav led a team of 4 during the 2025 hackathon',
  '',
  'PERSONAL DETAILS',
  'Date of Birth: 01/01/2004',
  'Gender: Male',
  'Religion: Example',
  "Father's Name: Test Testkumar",
  'Aadhaar: 2345 6789 0123',
  'PAN: ABCDE1234F',
].join('\n');

const redactor = new PiiRedactor();
const redact = (text: string): string => redactor.redact(text).redactedText;

describe('PiiRedactor on a full synthetic resume', () => {
  const { redactedText, vault } = redactor.redact(RESUME);

  it.each([
    'Aarav',
    'Testkumar',
    'aarav.test@example.com',
    '98765 43210',
    'linkedin.com/in/aarav-test',
    'github.com/aaravtest',
    'Hyderabad 500001',
    '01/01/2004',
    'Male',
    '2345 6789 0123',
    'ABCDE1234F',
  ])('removes %s', (secret) => {
    expect(redactedText).not.toContain(secret);
  });

  it('uses stable, typed placeholders', () => {
    expect(redactedText.split('\n')[0]).toBe('[NAME]');
    expect(redactedText).toContain('[EMAIL_1] | [PHONE_1] | [LINK_1] | [LINK_2].');
    expect(redactedText).toContain('[ADDRESS_1]');
    expect(redactedText).toContain('[PERSONAL_1]');
    expect(redactedText).toContain('Aadhaar: [ID_1]');
    expect(redactedText).toContain('PAN: [ID_2]');
    expect(redactedText).toContain('- [NAME_1] led a team');
  });

  it('keeps resume content that only looks like numbers', () => {
    expect(redactedText).toContain('2022-2026, CGPA 8.4');
    expect(redactedText).toContain('1200 students');
    expect(redactedText).toContain('40%');
    expect(redactedText).toContain('2025 hackathon');
  });

  it('restores real values locally, round-trip exact', () => {
    expect(vault.restore(redactedText)).toBe(RESUME);
  });

  it('never serialises the vault', () => {
    expect(JSON.stringify({ vault })).toBe('{"vault":{}}');
    expect(vault.size).toBeGreaterThan(5);
  });
});

describe('performance (ReDoS guard)', () => {
  it.each([
    ['a.'.repeat(12_000)],
    ['a'.repeat(24_000)],
    ['1 '.repeat(12_000)],
    ['-'.repeat(24_000)],
    ['x.dev'.repeat(5_000)],
  ])('redacts hostile input in linear time', (input) => {
    const start = Date.now();
    redactor.redact(input);
    expect(Date.now() - start).toBeLessThan(250);
  });
});

describe('false positives stay untouched', () => {
  it.each([
    'Education\n2018\n2019\n2020\nBTech',
    'EXPERIENCE\nHandled 1000000000 events 9.12 8.75 8.93 9.01',
    'EXPERIENCE\nProcessed 500000 records, improving latency',
    'EXPERIENCE\nWorked 2019-2023 at Example Corp',
    'EXPERIENCE\nScored 98.75 percentile in 2024',
    'SKILLS\nJava Spring Boot\nBuilt with Socket.io and Node.js',
  ])('%j', (text) => {
    expect(redact(text)).toBe(text);
  });

  it('does not eat words that share letters with a name part', () => {
    expect(redact('Ram Kumar\nSKILLS\nLaptop with 8GB RAM, Ramesh as mentor')).toBe(
      '[NAME]\nSKILLS\nLaptop with 8GB RAM, Ramesh as mentor',
    );
  });
});

describe('name detection', () => {
  it('skips a job title above the name, and keeps the title', () => {
    const text =
      'Senior Software Engineer\nJohn Doe\njohn@example.com\nSenior Software Engineer at Acme';
    expect(redact(text)).toBe(
      'Senior Software Engineer\n[NAME]\n[EMAIL_1]\nSenior Software Engineer at Acme',
    );
  });

  it('redacts surname mentions such as "Mr. Doe" and "Doe, J."', () => {
    expect(redact('John Doe\nREFERENCES\nMr. Doe; Doe, J.')).toBe(
      '[NAME]\nREFERENCES\nMr. [NAME_2]; [NAME_2], J.',
    );
  });

  it('handles non-ASCII letters', () => {
    expect(redact('Zoë Ålvarez\nSKILLS\nZoë built X')).toBe('[NAME]\nSKILLS\n[NAME_1] built X');
  });

  it('strips an honorific from the name and restores exactly', () => {
    const text = 'Dr. Meera Example\nSKILLS\nGo';
    const { redactedText, vault } = redactor.redact(text);
    expect(redactedText).toBe('Dr. [NAME]\nSKILLS\nGo');
    expect(vault.restore(redactedText)).toBe(text);
  });

  it('uses a "Name:" label near the top', () => {
    expect(redact('CURRICULUM VITAE\nName: Priya Example\nSkills: Java')).toBe(
      'CURRICULUM VITAE\nName: [NAME]\nSkills: Java',
    );
  });

  it('stops looking once a section starts', () => {
    expect(redact('SKILLS\nJava\nPython')).toBe('SKILLS\nJava\nPython');
    expect(redact('Resume Summary\nSkills: Java, SQL')).toBe('Resume Summary\nSkills: Java, SQL');
  });
});

describe('Indian PII coverage', () => {
  it('redacts multi-line addresses', () => {
    expect(redact('EXPERIENCE\nAddress: Flat 302, Sunrise Apts\nPune - 411001')).toBe(
      'EXPERIENCE\n[ADDRESS_1]\n[ADDRESS_2]',
    );
  });

  it.each(['DOB 12/03/1999', 'D.O.B: 12-03-1999', 'Born on 12 March 1999'])(
    'redacts unlabelled birth dates: %s',
    (line) => {
      expect(redact(`SKILLS\n${line}`)).toBe('SKILLS\n[PERSONAL_1]');
    },
  );

  it('redacts lowercase PAN and IFSC codes', () => {
    expect(redact('SKILLS\npan abcde1234f, ifsc SBIN0001234')).toBe(
      'SKILLS\npan [ID_1], ifsc [ID_2]',
    );
  });

  it.each([
    ['+91-9876543210', '[PHONE_1]'],
    ['987 654 3210', '[PHONE_1]'],
    ['098765 43210', '[PHONE_1]'],
    ['040-23456789', '[PHONE_1]'],
    ['+1 415 555 0100', '[PHONE_1]'],
  ])('redacts phone format %s', (phone, expected) => {
    expect(redact(`SKILLS\nCall ${phone} now`)).toBe(`SKILLS\nCall ${expected} now`);
  });

  it('sees fullwidth digits once text is normalised', () => {
    const fullwidth = Array.from('9876543210')
      .map((d) => String.fromCodePoint(0xff10 + Number(d)))
      .join('');
    expect(redact(normaliseText(`SKILLS\nCall ${fullwidth}`))).toBe('SKILLS\nCall [PHONE_1]');
  });

  it('redacts portfolio links and keeps emails on such domains whole', () => {
    expect(redact('SKILLS\njohndoe.dev twitter.com/jd jd.github.io me@johndoe.dev')).toBe(
      'SKILLS\n[LINK_1] [LINK_2] [LINK_3] [EMAIL_1]',
    );
  });
});

describe('RedactionVault', () => {
  it('reuses the placeholder for a repeated value', () => {
    const vault = new RedactionVault();
    expect(vault.placeholderFor('EMAIL', 'a@example.com')).toBe('[EMAIL_1]');
    expect(vault.placeholderFor('EMAIL', 'b@example.com')).toBe('[EMAIL_2]');
    expect(vault.placeholderFor('EMAIL', 'a@example.com')).toBe('[EMAIL_1]');
  });

  it('tolerates small model edits to placeholders (AM-16)', () => {
    const vault = new RedactionVault();
    vault.placeholderFor('EMAIL', 'a@example.com');
    vault.placeholderFor('NAME', 'Aarav Testkumar');
    vault.placeholderFor('NAME', 'Aarav', true);
    expect(vault.restore('Mail [email 1] or [Email_1], signed [ name ] ([Name 1]).')).toBe(
      'Mail a@example.com or a@example.com, signed Aarav Testkumar (Aarav).',
    );
    expect(vault.restore('Unknown [PHONE_9] stays')).toBe('Unknown [PHONE_9] stays');
  });

  it('only requires contact placeholders to survive a rewrite', () => {
    const vault = new RedactionVault();
    vault.placeholderFor('NAME', 'Aarav Testkumar');
    vault.placeholderFor('NAME', 'Aarav', true);
    vault.placeholderFor('EMAIL', 'a@example.com');
    vault.placeholderFor('PHONE', '+91 98765 43210');
    vault.placeholderFor('PERSONAL', 'Gender: Male');
    vault.placeholderFor('ADDRESS', 'Flat 4B, Test Nagar');
    expect(vault.missingIn('[NAME] can be reached at [EMAIL 1]')).toEqual(['[PHONE_1]']);
    expect(vault.missingIn('[NAME] [EMAIL_1] [PHONE_1]')).toEqual([]);
    expect(vault.missingIn('nothing', ['ADDRESS'])).toEqual(['[ADDRESS_1]']);
  });
});
