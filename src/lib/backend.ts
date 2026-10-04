export async function getBackendDemo(path: string): Promise<Response> {
  const base = process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:3001";
  try {
    const upstream = await fetch(new URL(path, base), {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Dental backend is unavailable." }, { status: 503 });
  }
}
