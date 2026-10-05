import { describe, expect, it } from 'vitest';
import {
  AppError,
  AuthError,
  ERROR_CODES,
  ForbiddenError,
  InternalError,
  NoCreditsError,
  NotFoundError,
  PayloadTooLargeError,
  PaymentError,
  QuotaExceededError,
  RateLimitError,
  SoldOutError,
  UnavailableError,
  UpstreamError,
  ValidationError,
} from '../src';

describe('AppError hierarchy', () => {
  const errors: readonly AppError[] = [
    new ValidationError('m'),
    new AuthError('m'),
    new ForbiddenError('m'),
    new NotFoundError('m'),
    new QuotaExceededError('m'),
    new SoldOutError('m'),
    new NoCreditsError('m'),
    new PaymentError('m'),
    new UpstreamError('m'),
    new RateLimitError('m'),
    new PayloadTooLargeError('m'),
    new UnavailableError('m'),
    new InternalError('m'),
  ];

  it('has exactly one class per error code', () => {
    expect(errors.map((e) => e.code).toSorted()).toEqual([...ERROR_CODES].toSorted());
  });

  it.each(errors.map((e) => [e.code, e] as const))(
    '%s is a typed Error named by its code',
    (code, error) => {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(code);
      expect(error.message).toBe('m');
    },
  );
});
