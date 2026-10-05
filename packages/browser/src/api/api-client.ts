import {
  AccountExportSchema,
  AdminOverviewSchema,
  CatalogResponseSchema,
  CoverLetterResultSchema,
  ErrorEnvelopeSchema,
  InterviewQuestionsResultSchema,
  LinkedInResultSchema,
  MeResponseSchema,
  OrderResponseSchema,
  RewriteResultSchema,
  RoastResponseSchema,
  TailorResultSchema,
  VerifyResponseSchema,
  CreditBalanceSchema,
  type AccountExport,
  type AdminOverview,
  type AnalyticsEvent,
  type CatalogResponse,
  type CoverLetterRequest,
  type CoverLetterResult,
  type CreditBalance,
  type InterviewQuestionsRequest,
  type InterviewQuestionsResult,
  type LinkedInRequest,
  type LinkedInResult,
  type MeResponse,
  type OrderRequest,
  type OrderResponse,
  type ProductId,
  type RewriteRequest,
  type RewriteResult,
  type RoastRequest,
  type RoastResponse,
  type TailorRequest,
  type TailorResult,
  type VerifyRequest,
  type VerifyResponse,
} from '@engine/domain';
import { z } from 'zod';
import { ApiError, type ApiRequest, type ApiResponse, type Transport } from './transport';

/** Supplies the signed-in user's access token, or null when signed out. */
export interface AccessTokenSource {
  getAccessToken(): Promise<string | null>;
}

export interface Paid<T> {
  readonly result: T;
  readonly credits: readonly CreditBalance[];
}

type Auth = 'required' | 'optional' | 'none';

interface CallOptions {
  readonly body?: unknown;
  readonly auth: Auth;
  readonly turnstileToken?: string | null;
}

export const TURNSTILE_HEADER = 'cf-turnstile-response';

const PaidEnvelopeSchema = z.object({ result: z.unknown(), credits: z.array(CreditBalanceSchema) });

/**
 * Typed client for the v1 API (PRD B5). Every response is validated against the shared
 * contract; anything unexpected becomes an ApiError instead of reaching the UI.
 */
export class ApiClient {
  readonly #transport: Transport;
  readonly #tokens: AccessTokenSource;

  constructor(transport: Transport, tokens: AccessTokenSource) {
    this.#transport = transport;
    this.#tokens = tokens;
  }

  public roast(request: RoastRequest, turnstileToken: string | null): Promise<RoastResponse> {
    return this.#call('POST', '/v1/roaster/roast', RoastResponseSchema, {
      body: request,
      auth: 'optional',
      turnstileToken,
    });
  }

  public rewrite(request: RewriteRequest): Promise<Paid<RewriteResult>> {
    return this.#paid('/v1/roaster/rewrite', RewriteResultSchema, request);
  }

  public tailor(request: TailorRequest): Promise<Paid<TailorResult>> {
    return this.#paid('/v1/roaster/tailor', TailorResultSchema, request);
  }

  public coverLetter(request: CoverLetterRequest): Promise<Paid<CoverLetterResult>> {
    return this.#paid('/v1/roaster/cover-letter', CoverLetterResultSchema, request);
  }

  public linkedIn(request: LinkedInRequest): Promise<Paid<LinkedInResult>> {
    return this.#paid('/v1/roaster/linkedin', LinkedInResultSchema, request);
  }

  public interviewQuestions(
    request: InterviewQuestionsRequest,
  ): Promise<Paid<InterviewQuestionsResult>> {
    return this.#paid('/v1/roaster/interview-questions', InterviewQuestionsResultSchema, request);
  }

  public me(): Promise<MeResponse> {
    return this.#call('GET', '/v1/me', MeResponseSchema, { auth: 'required' });
  }

  public catalog(product: ProductId): Promise<CatalogResponse> {
    const path = `/v1/billing/catalog?product=${product}`;
    return this.#call('GET', path, CatalogResponseSchema, { auth: 'none' });
  }

  public createOrder(request: OrderRequest): Promise<OrderResponse> {
    return this.#call('POST', '/v1/pay/order', OrderResponseSchema, {
      body: request,
      auth: 'required',
    });
  }

  public verifyPayment(request: VerifyRequest): Promise<VerifyResponse> {
    return this.#call('POST', '/v1/pay/verify', VerifyResponseSchema, {
      body: request,
      auth: 'required',
    });
  }

  public exportAccount(): Promise<AccountExport> {
    return this.#call('GET', '/v1/account/export', AccountExportSchema, { auth: 'required' });
  }

  public async deleteAccount(): Promise<void> {
    await this.#send('POST', '/v1/account/delete', {
      body: { confirm: 'DELETE' },
      auth: 'required',
    });
  }

  /** Anonymous product event; failures are ignored so tracking never breaks the page. */
  public async track(event: AnalyticsEvent): Promise<void> {
    await this.#send('POST', '/v1/events', { body: event, auth: 'none' }).catch(() => null);
  }

  /** Owner-only. Everyone else gets NOT_FOUND, exactly like a missing route (AM-04). */
  public adminOverview(days: 7 | 30 | 90): Promise<AdminOverview> {
    const path = `/v1/admin/overview?days=${String(days)}`;
    return this.#call('GET', path, AdminOverviewSchema, { auth: 'required' });
  }

  /** Paid routes return `{ result, credits }`; the envelope and the result are checked separately. */
  async #paid<S extends z.ZodType>(
    path: string,
    result: S,
    body: unknown,
  ): Promise<Paid<z.infer<S>>> {
    const envelope = await this.#call('POST', path, PaidEnvelopeSchema, { body, auth: 'required' });
    const parsed = result.safeParse(envelope.result);
    if (!parsed.success) {
      throw new ApiError('BAD_RESPONSE', 'Unexpected response from the server.', 200);
    }
    return { result: parsed.data, credits: envelope.credits };
  }

  async #call<S extends z.ZodType>(
    method: ApiRequest['method'],
    path: string,
    schema: S,
    options: CallOptions,
  ): Promise<z.infer<S>> {
    const response = await this.#send(method, path, options);
    const parsed = schema.safeParse(response.body);
    if (!parsed.success) {
      throw new ApiError('BAD_RESPONSE', 'Unexpected response from the server.', response.status);
    }
    return parsed.data;
  }

  async #send(
    method: ApiRequest['method'],
    path: string,
    options: CallOptions,
  ): Promise<ApiResponse> {
    const headers = await this.#headers(options);
    const response = await this.#transport.send(
      options.body === undefined
        ? { method, path, headers }
        : { method, path, headers, body: options.body },
    );
    if (response.status < 200 || response.status >= 300) {
      throw toApiError(response.status, response.body);
    }
    return response;
  }

  async #headers(options: CallOptions): Promise<Record<string, string>> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.auth !== 'none') {
      const token = await this.#tokens.getAccessToken();
      if (token !== null) headers['authorization'] = `Bearer ${token}`;
      else if (options.auth === 'required') {
        throw new ApiError('UNAUTHENTICATED', 'Please sign in first.', 401);
      }
    }
    if (options.turnstileToken !== undefined && options.turnstileToken !== null) {
      headers[TURNSTILE_HEADER] = options.turnstileToken;
    }
    return headers;
  }
}

function toApiError(status: number, body: unknown): ApiError {
  const envelope = ErrorEnvelopeSchema.safeParse(body);
  if (!envelope.success) {
    return new ApiError('BAD_RESPONSE', 'Something went wrong. Please try again.', status);
  }
  const { code, message, requestId } = envelope.data.error;
  return new ApiError(code, message, status, requestId);
}
