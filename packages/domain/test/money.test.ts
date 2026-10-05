import { describe, expect, it } from 'vitest';
import { Money, ValidationError } from '../src';

describe('Money', () => {
  describe('creation', () => {
    it('holds whole paise', () => {
      expect(Money.ofPaise(9900).toPaise()).toBe(9900);
      expect(Money.ofRupees(99).toPaise()).toBe(9900);
      expect(Money.zero().toPaise()).toBe(0);
    });

    it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
      'rejects %s paise',
      (paise) => {
        expect(() => Money.ofPaise(paise)).toThrow(ValidationError);
      },
    );

    it.each([-1, 99.5, Number.NaN])('rejects %s rupees', (rupees) => {
      expect(() => Money.ofRupees(rupees)).toThrow(ValidationError);
    });

    it('rejects rupee amounts that overflow safe paise', () => {
      expect(() => Money.ofRupees(Number.MAX_SAFE_INTEGER)).toThrow(ValidationError);
    });
  });

  describe('arithmetic', () => {
    it('adds and subtracts without mutating either operand', () => {
      const a = Money.ofRupees(399);
      const b = Money.ofRupees(199);
      expect(a.add(b).toPaise()).toBe(59800);
      expect(a.subtract(b).toPaise()).toBe(20000);
      expect(a.toPaise()).toBe(39900);
      expect(b.toPaise()).toBe(19900);
    });

    it('never goes negative', () => {
      expect(() => Money.ofRupees(199).subtract(Money.ofRupees(399))).toThrow(ValidationError);
    });
  });

  describe('comparison', () => {
    it('compares by value', () => {
      expect(Money.ofRupees(99).equals(Money.ofPaise(9900))).toBe(true);
      expect(Money.ofRupees(99).equals(Money.ofRupees(199))).toBe(false);
      expect(Money.ofRupees(399).isGreaterThan(Money.ofRupees(199))).toBe(true);
      expect(Money.ofRupees(199).isGreaterThan(Money.ofRupees(199))).toBe(false);
      expect(Money.zero().isZero()).toBe(true);
      expect(Money.ofPaise(1).isZero()).toBe(false);
    });
  });

  describe('format', () => {
    it.each([
      [9900, '₹99'],
      [9950, '₹99.50'],
      [9905, '₹99.05'],
      [10_000_000, '₹1,00,000'],
      [0, '₹0'],
    ])('formats %i paise as %s', (paise, expected) => {
      expect(Money.ofPaise(paise).format()).toBe(expected);
    });
  });

  it('reports a typed VALIDATION error', () => {
    try {
      Money.ofPaise(-5);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toMatchObject({ code: 'VALIDATION', name: 'ValidationError' });
    }
  });
});
