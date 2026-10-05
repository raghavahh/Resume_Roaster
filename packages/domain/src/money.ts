import { ValidationError } from './errors';

const PAISE_PER_RUPEE = 100;
const rupeeGrouping = new Intl.NumberFormat('en-IN');

/**
 * An amount of Indian rupees, held as whole paise (PRD B6).
 * Immutable, and can never be negative or fractional: invalid amounts cannot be created.
 */
export class Money {
  readonly #paise: number;

  private constructor(paise: number) {
    this.#paise = paise;
  }

  public static ofPaise(paise: number): Money {
    if (!Number.isSafeInteger(paise) || paise < 0) {
      throw new ValidationError(
        `Money must be a non-negative whole number of paise, got ${String(paise)}`,
      );
    }
    return new Money(paise);
  }

  public static ofRupees(rupees: number): Money {
    if (!Number.isSafeInteger(rupees)) {
      throw new ValidationError(`Money.ofRupees needs whole rupees, got ${String(rupees)}`);
    }
    return Money.ofPaise(rupees * PAISE_PER_RUPEE);
  }

  public static zero(): Money {
    return new Money(0);
  }

  /** The amount in paise, e.g. for the Razorpay Orders API. */
  public toPaise(): number {
    return this.#paise;
  }

  public add(other: Money): Money {
    return Money.ofPaise(this.#paise + other.#paise);
  }

  /** Throws a ValidationError if the result would be negative. */
  public subtract(other: Money): Money {
    return Money.ofPaise(this.#paise - other.#paise);
  }

  public isZero(): boolean {
    return this.#paise === 0;
  }

  public isGreaterThan(other: Money): boolean {
    return this.#paise > other.#paise;
  }

  public equals(other: Money): boolean {
    return this.#paise === other.#paise;
  }

  /** Indian formatting: "₹99", "₹1,00,000", "₹99.50". */
  public format(): string {
    const rupees = Math.floor(this.#paise / PAISE_PER_RUPEE);
    const paise = this.#paise % PAISE_PER_RUPEE;
    const whole = `₹${rupeeGrouping.format(rupees)}`;
    return paise === 0 ? whole : `${whole}.${String(paise).padStart(2, '0')}`;
  }
}
