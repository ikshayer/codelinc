import { NextResponse } from "next/server";

export async function GET() {
  try {
    const base = process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:3001";
    const response = await fetch(`${base}/api/demo/members`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Could not load members from the backend." }, { status: 503 });
  }
}
