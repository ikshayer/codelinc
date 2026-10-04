/** Server-side HTTP bridge used only by the API route handlers. */
export function backendUrl(path: string, base = process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:3001"): string {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Backend path must start with a single slash.");
  return `${base.trim().replace(/\/+$/, "")}${path}`;
}

export async function proxyBackend(path: string, init: RequestInit = {}, base?: string): Promise<Response> {
  try {
    const timeout = AbortSignal.timeout(15000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    // Node's RequestInit typings omit cache; Next's fetch accepts this option.
    const options: RequestInit & { cache: "no-store" } = { ...init, cache: "no-store", signal };
    const response = await fetch(backendUrl(path, base), options);
    const body: unknown = await response.json();
    return Response.json(body, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: { code: "UNAVAILABLE", message: "The backend service is unavailable or returned an unreadable response.", retryable: true } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
