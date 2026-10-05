/** Every error code the API can return (PRD B5). Mapped to HTTP status in exactly one place. */
export const ERROR_CODES = [
  'VALIDATION',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'QUOTA_EXCEEDED',
  'SOLD_OUT',
  'NO_CREDITS',
  'PAYMENT_INVALID',
  'UPSTREAM_FAILED',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'UNAVAILABLE',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** The single code → HTTP status mapping (PRD D3 rule 11), shared by the API and its test doubles. */
export const HTTP_STATUS: Readonly<Record<ErrorCode, number>> = Object.freeze({
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  NO_CREDITS: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  QUOTA_EXCEEDED: 429,
  RATE_LIMITED: 429,
  PAYMENT_INVALID: 400,
  INTERNAL: 500,
  UPSTREAM_FAILED: 502,
  SOLD_OUT: 503,
  UNAVAILABLE: 503,
});

/**
 * Base of all expected, typed failures. Abstract, so only the subclasses below can be thrown.
 * `name` is the code, not the class name: minifiers mangle class names.
 */
export abstract class AppError extends Error {
  public readonly code: ErrorCode;

  protected constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION', message);
  }
}

export class AuthError extends AppError {
  constructor(message: string) {
    super('UNAUTHENTICATED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super('FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super('NOT_FOUND', message);
  }
}

export class QuotaExceededError extends AppError {
  constructor(message: string) {
    super('QUOTA_EXCEEDED', message);
  }
}

export class SoldOutError extends AppError {
  constructor(message: string) {
    super('SOLD_OUT', message);
  }
}

export class NoCreditsError extends AppError {
  constructor(message: string) {
    super('NO_CREDITS', message);
  }
}

export class PaymentError extends AppError {
  constructor(message: string) {
    super('PAYMENT_INVALID', message);
  }
}

export class UpstreamError extends AppError {
  constructor(message: string) {
    super('UPSTREAM_FAILED', message);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string) {
    super('RATE_LIMITED', message);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message: string) {
    super('PAYLOAD_TOO_LARGE', message);
  }
}

/** A kill switch is on (PRD C3 incident response) or a dependency is down. */
export class UnavailableError extends AppError {
  constructor(message: string) {
    super('UNAVAILABLE', message);
  }
}

/** An unexpected failure. The message is logged, never shown to the user. */
export class InternalError extends AppError {
  constructor(message: string) {
    super('INTERNAL', message);
  }
}
