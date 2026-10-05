import { describe, expect, it } from 'vitest';
import {
  AppError,
  AuthError,
  ForbiddenError,
  NoCreditsError,
  PaymentError,
  QuotaExceededError,
  RateLimitError,
  SoldOutError,
  UpstreamError,
  ValidationError,
} from '../src';

describe('AppError hierarchy', () => {
  it.each([
    [new ValidationError('m'), 'VALIDATION', 'ValidationError'],
    [new AuthError('m'), 'UNAUTHENTICATED', 'AuthError'],
    [new ForbiddenError('m'), 'FORBIDDEN', 'ForbiddenError'],
    [new QuotaExceededError('m'), 'QUOTA_EXCEEDED', 'QuotaExceededError'],
    [new SoldOutError('m'), 'SOLD_OUT', 'SoldOutError'],
    [new NoCreditsError('m'), 'NO_CREDITS', 'NoCreditsError'],
    [new PaymentError('m'), 'PAYMENT_INVALID', 'PaymentError'],
    [new UpstreamError('m'), 'UPSTREAM_FAILED', 'UpstreamError'],
    [new RateLimitError('m'), 'RATE_LIMITED', 'RateLimitError'],
  ])('%o carries code %s', (error, code, name) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.name).toBe(name);
    expect(error.message).toBe('m');
  });
});
