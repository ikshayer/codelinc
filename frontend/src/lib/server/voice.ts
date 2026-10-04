import { backendUrl } from "./backend";

const MAX_BYTES = 3_000_000;
export async function proxyVoice(request: Request, path: string): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: { code: "FORBIDDEN", message: "Voice requests must come from this app.", retryable: false } }, { status: 403 });
  const timeout = AbortSignal.timeout(95_000);
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    if (request.body) {
      const reader = request.body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) { await reader.cancel(); return Response.json({ error: { code: "TOO_LARGE", message: "The recording is too large.", retryable: false } }, { status: 413 }); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    const headers = new Headers({ "Content-Type": "application/json" });
    const token = request.headers.get("authorization"); if (token) headers.set("authorization", token);
    const response = await fetch(backendUrl(path, process.env.VOICE_BACKEND_URL ?? "http://127.0.0.1:3002"), {
      method: request.method, headers, ...(size ? { body: Buffer.concat(chunks) } : {}), cache: "no-store",
      signal: AbortSignal.any([request.signal, timeout]),
    });
    return new Response(response.body, { status: response.status, headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store", "X-Accel-Buffering": "no",
    } });
  } catch {
    return Response.json({ error: { code: "UNAVAILABLE", message: "The voice service is unavailable. Start npm run dev:voice in backend and try again.", retryable: true } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
