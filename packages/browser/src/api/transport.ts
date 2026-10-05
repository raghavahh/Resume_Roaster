import type { ErrorCode } from '@engine/domain';

export interface ApiRequest {
  readonly method: 'GET' | 'POST';
  /** Path plus optional query, e.g. `/v1/billing/catalog?product=roaster`. */
  readonly path: string;
  readonly body?: unknown;
  readonly headers: Readonly<Record<string, string>>;
}

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

/** The only way browser code talks to the API (PRD B2 "ApiClient: only door to the API"). */
export interface Transport {
  send(request: ApiRequest): Promise<ApiResponse>;
}

/** Client-side failures that never reach the server get their own codes. */
export type ClientErrorCode = ErrorCode | 'NETWORK' | 'BAD_RESPONSE';

export class ApiError extends Error {
  public readonly code: ClientErrorCode;
  public readonly status: number;
  public readonly requestId: string | null;

  constructor(code: ClientErrorCode, message: string, status = 0, requestId: string | null = null) {
    super(message);
    this.name = code;
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Real HTTP transport. No cookies (Bearer tokens only, so no CSRF), no caching, no redirects,
 * and a hard timeout.
 */
export class FetchTransport implements Transport {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(
    baseUrl: string,
    fetchImpl: typeof fetch = fetch.bind(globalThis),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
  }

  public async send(request: ApiRequest): Promise<ApiResponse> {
    const hasBody = request.body !== undefined;
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${request.path}`, {
        method: request.method,
        headers: hasBody
          ? { ...request.headers, 'content-type': 'application/json' }
          : request.headers,
        body: hasBody ? JSON.stringify(request.body) : null,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch {
      throw new ApiError('NETWORK', 'Could not reach the server. Check your connection.');
    }
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  }
}
