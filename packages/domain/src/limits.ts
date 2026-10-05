/** Every size and count limit, in one place (PRD A5, A7, B5, C3). */
export const LIMITS = {
  /** Resume text, pasted or extracted (US-2). */
  resumeMaxChars: 12_000,
  resumeMinChars: 200,
  /** Job post for tailoring (US-8). */
  jobPostMaxChars: 8_000,
  jobPostMinChars: 100,
  targetRoleMaxChars: 80,
  /** PDF upload, checked in the browser (US-1, T9). */
  pdfMaxBytes: 2 * 1024 * 1024,
  pdfMaxPages: 4,
  pdfParseTimeoutMs: 10_000,
  /** Request bodies, checked by the Worker (T10). */
  requestBodyMaxBytes: 32 * 1024,
  /** Free roasts per day (A5). */
  freeRoastsPerDayAnonymous: 1,
  freeRoastsPerDaySignedIn: 3,
  /** Burst limit for roasts per IP per minute (B5). */
  roastBurstPerMinute: 5,
  /** Paid generation routes per user per hour (B5); passes may raise it. */
  paidRoutesPerHourDefault: 30,
  /** Days before saved generations are deleted (C3). */
  generationRetentionDays: 30,
  /** Minutes before an unfinished credit reservation is released (A6.5). */
  reservationTimeoutMinutes: 10,
  /** Days within which unused one-time credits are refundable (A6.4). */
  refundWindowDays: 7,
} as const;
