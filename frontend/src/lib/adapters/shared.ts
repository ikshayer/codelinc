import type { AdapterError, AdapterErrorCode, AdapterResult } from "./types";

// Shared transport helpers for live adapters and timing helpers for mocks.

export function adapterError(code: AdapterErrorCode, message: string, retryable = false, fieldPath?: string): AdapterError {
  return fieldPath ? { code, message, retryable, fieldPath } : { code, message, retryable };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

const ERROR_CODES: readonly AdapterErrorCode[] = [
  "UNAVAILABLE", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "TOO_LARGE", "UNSUPPORTED_TYPE", "ENCRYPTED", "UNREADABLE",
  "TOO_MANY_PAGES", "INVALID", "RATE_LIMITED", "TIMEOUT", "NETWORK", "CANCELLED", "CONFLICT", "UNKNOWN",
];

function statusDefaults(status: number, service: string): [AdapterErrorCode, string, boolean] {
  switch (status) {
    case 401: return ["UNAUTHORIZED", "Your session has ended. Sign in again to continue.", false];
    case 403: return ["FORBIDDEN", `You don't have access to the ${service}.`, false];
    case 404: return ["NOT_FOUND", `The ${service} isn't available here.`, false];
    case 413: return ["TOO_LARGE", `That file is larger than the ${service} accepts.`, false];
    case 415: return ["UNSUPPORTED_TYPE", "That file type isn't supported.", false];
    case 422: return ["INVALID", `The ${service} couldn't accept that input.`, false];
    case 429: return ["RATE_LIMITED", "Too many requests. Wait a moment and try again.", true];
    case 502: return ["UNAVAILABLE", `The ${service} returned an unusable response. Try again.`, true];
    case 503: return ["UNAVAILABLE", `The ${service} is unavailable right now.`, true];
    case 504: return ["TIMEOUT", `The ${service} took too long to respond. Try again.`, true];
    default: return ["UNKNOWN", `The ${service} failed (${status}).`, status >= 500];
  }
}

export function isAdapterErrorCode(value: unknown): value is AdapterErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

/** Wire shape of a normalized issue from the proposed backend contract. */
export interface WireIssue {
  code?: string;
  message?: string;
  retryable?: boolean;
  fieldPath?: string;
}

/** Normalizes a backend issue, keeping only known codes; unknown fields fall back to the given error. */
export function normalizeIssue(raw: WireIssue | undefined, fallback: AdapterError): AdapterError {
  if (!raw) return fallback;
  return adapterError(isAdapterErrorCode(raw.code) ? raw.code : fallback.code, raw.message ?? fallback.message, raw.retryable ?? fallback.retryable, raw.fieldPath);
}

/** Maps an HTTP failure (status + optional { error } envelope) to a normalized AdapterError. */
export function errorFromHttp(status: number, body: unknown, service = "service"): AdapterError {
  const envelope = body && typeof body === "object" ? (body as { error?: WireIssue & { issues?: { field?: string | null }[] } }).error : undefined;
  const [code, message, retryable] = statusDefaults(status, service);
  // The engine reports field problems as error.issues[].field; surface the first as fieldPath.
  const fieldPath = envelope?.fieldPath ?? envelope?.issues?.find((i) => i.field)?.field ?? undefined;
  return normalizeIssue(envelope && { ...envelope, fieldPath }, adapterError(code, message, retryable));
}

/**
 * JSON request with normalized errors. A missing endpoint (404) or network
 * failure maps to an honest UNAVAILABLE/NETWORK error — never to sample data.
 */
export async function requestJson<T>(url: string, init: RequestInit & { timeoutMs?: number; service?: string } = {}): Promise<AdapterResult<T>> {
  const { timeoutMs = 15000, signal, service = "service", ...rest } = init;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(url, { ...rest, signal: combined, credentials: "same-origin" });
  } catch {
    if (signal?.aborted) return { ok: false, error: adapterError("CANCELLED", "Request cancelled.") };
    if (timeout.aborted) return { ok: false, error: adapterError("TIMEOUT", "The service took too long to respond. Try again.", true) };
    return { ok: false, error: adapterError("NETWORK", "Couldn't reach the service. Check your connection and try again.", true) };
  }
  if (response.status === 204) return { ok: true, value: undefined as T };
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: errorFromHttp(response.status, body, service) };
  if (body === null) return { ok: false, error: adapterError("UNAVAILABLE", "The service returned an unreadable response.", true) };
  return { ok: true, value: body as T };
}

/** Resolves after ms, or rejects with AbortError when the signal aborts. Used by mocks to behave like real async calls. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
