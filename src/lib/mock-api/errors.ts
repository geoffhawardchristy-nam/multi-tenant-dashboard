import type {
  ApiErrorCode,
  ApiErrorPayload,
  ConflictErrorDetails,
  HttpStatusCode,
} from '@/types/api';

export class MockApiError extends Error {
  public readonly status: HttpStatusCode;
  public readonly code: ApiErrorCode;
  public readonly fieldErrors?: Readonly<Record<string, string>>;
  public readonly conflictDetails?: ConflictErrorDetails;
  public readonly retryAfterMs?: number;
  public readonly timestamp: string;

  constructor(params: {
    status: HttpStatusCode;
    code: ApiErrorCode;
    message: string;
    fieldErrors?: Readonly<Record<string, string>>;
    conflictDetails?: ConflictErrorDetails;
    retryAfterMs?: number;
  }) {
    super(params.message);
    this.name = 'MockApiError';
    this.status = params.status;
    this.code = params.code;
    this.fieldErrors = params.fieldErrors;
    this.conflictDetails = params.conflictDetails;
    this.retryAfterMs = params.retryAfterMs;
    this.timestamp = new Date().toISOString();
    Object.setPrototypeOf(this, MockApiError.prototype);
  }

  public toPayload(): ApiErrorPayload {
    return {
      status: this.status,
      code: this.code,
      message: this.message,
      fieldErrors: this.fieldErrors,
      conflictDetails: this.conflictDetails,
      retryAfterMs: this.retryAfterMs,
      timestamp: this.timestamp,
    };
  }
}

export function isMockApiError(error: unknown): error is MockApiError {
  return error instanceof MockApiError;
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (isMockApiError(error) && error.code === 'REQUEST_ABORTED') {
    return true;
  }
  return false;
}