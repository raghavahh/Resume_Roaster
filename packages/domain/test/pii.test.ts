import { describe, expect, it } from 'vitest';
import { PiiRedactor, RedactionVault } from '../src';

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

describe('PiiRedactor.redact', () => {
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
    expect(redactedText).toContain('[EMAIL_1]');
    expect(redactedText).toContain('[PHONE_1]');
    expect(redactedText).toContain('[LINK_1]');
    expect(redactedText).toContain('[LINK_2].');
    expect(redactedText).toContain('[ADDRESS_1]');
    expect(redactedText).toContain('[PERSONAL_1]');
    expect(redactedText).toContain('Aadhaar: [ID_1]');
    expect(redactedText).toContain('PAN: [ID_2]');
    expect(redactedText).toContain('- [FIRST_NAME] led a team');
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
    vault.placeholderFor('FIRST_NAME', 'Aarav');
    expect(vault.restore('Mail [email 1] or [Email_1], signed [ name ] ([First Name]).')).toBe(
      'Mail a@example.com or a@example.com, signed Aarav Testkumar (Aarav).',
    );
    expect(vault.restore('Unknown [PHONE_9] stays')).toBe('Unknown [PHONE_9] stays');
  });

  it('reports placeholders the model dropped', () => {
    const vault = new RedactionVault();
    vault.placeholderFor('NAME', 'Aarav Testkumar');
    vault.placeholderFor('EMAIL', 'a@example.com');
    vault.placeholderFor('PHONE', '+91 98765 43210');
    expect(vault.missingIn('[NAME] can be reached at [EMAIL 1]')).toEqual(['[PHONE_1]']);
  });
});

describe('name detection', () => {
  it('uses a "Name:" label anywhere', () => {
    const { redactedText } = redactor.redact('CURRICULUM VITAE\nName: Priya Example\nSkills: Java');
    expect(redactedText).toBe('CURRICULUM VITAE\nName: [NAME]\nSkills: Java');
  });

  it('does not treat a heading as a name', () => {
    const text = 'Resume Summary\nSkills: Java, SQL';
    expect(redactor.redact(text).redactedText).toBe(text);
  });

  it('skips short first names when replacing loose mentions', () => {
    const { redactedText } = redactor.redact('Al Example\nAl joined; Allocation done');
    expect(redactedText).toBe('[NAME]\nAl joined; Allocation done');
  });
});

describe('false positives', () => {
  it.each([
    'Worked 2019-2023 at Example Corp',
    'Scored 98.75 percentile in 2024',
    'Reduced latency from 1200 ms to 300 ms',
    'Pincode-like 500001 alone is not an address',
  ])('leaves "%s" alone', (line) => {
    const text = `EXPERIENCE\n${line}`;
    expect(redactor.redact(text).redactedText).toBe(text);
  });
});
