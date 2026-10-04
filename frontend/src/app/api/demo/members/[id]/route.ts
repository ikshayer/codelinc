import { NextResponse } from "next/server";
const backend = process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:3001";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { try { const { id } = await context.params; const response = await fetch(`${backend}/api/demo/members/${encodeURIComponent(id)}`, { cache: "no-store" }); return NextResponse.json(await response.json(), { status: response.status }); } catch { return NextResponse.json({ error: "Backend data service is unavailable." }, { status: 503 }); } }
