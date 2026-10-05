/** Every error code the API can return (PRD B5). Mapped to HTTP status in exactly one place. */
export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'QUOTA_EXCEEDED'
  | 'SOLD_OUT'
  | 'NO_CREDITS'
  | 'PAYMENT_INVALID'
  | 'UPSTREAM_FAILED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

/** Base of all expected, typed failures. Abstract, so only the subclasses below can be thrown. */
export abstract class AppError extends Error {
  public abstract readonly code: ErrorCode;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  public override readonly code = 'VALIDATION';
}

export class AuthError extends AppError {
  public override readonly code = 'UNAUTHENTICATED';
}

export class ForbiddenError extends AppError {
  public override readonly code = 'FORBIDDEN';
}

export class QuotaExceededError extends AppError {
  public override readonly code = 'QUOTA_EXCEEDED';
}

export class SoldOutError extends AppError {
  public override readonly code = 'SOLD_OUT';
}

export class NoCreditsError extends AppError {
  public override readonly code = 'NO_CREDITS';
}

export class PaymentError extends AppError {
  public override readonly code = 'PAYMENT_INVALID';
}

export class UpstreamError extends AppError {
  public override readonly code = 'UPSTREAM_FAILED';
}

export class RateLimitError extends AppError {
  public override readonly code = 'RATE_LIMITED';
}
