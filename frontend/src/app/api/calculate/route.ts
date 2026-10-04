import { NextResponse } from "next/server";

const backend = process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:3001";

export async function POST(request: Request) {
  try {
    const response = await fetch(`${backend}/api/calculate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text(), cache: "no-store" });
    const body = await response.json().catch(() => ({ error: { code: "UNAVAILABLE", message: "Backend returned invalid JSON.", retryable: true } }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: "The backend calculation service is unavailable.", retryable: true } }, { status: 503 });
  }
}
