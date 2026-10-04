import type { NextRequest } from "next/server";
import { handlers } from "@/auth";

export const runtime = "nodejs";

function missingSecretResponse(request: NextRequest): Response | null {
  if (process.env.AUTH_SECRET?.trim()) return null;
  const action = request.nextUrl.pathname.split("/").at(-1);
  const headers = { "Cache-Control": "no-store" };
  // Guest pages still work when a deployment has not configured authentication.
  if (request.method === "GET" && action === "session") return Response.json(null, { headers });
  if (request.method === "GET" && action === "providers") return Response.json({}, { headers });
  return Response.json({ error: "Google sign-in is not configured." }, { status: 503, headers });
}

export async function GET(request: NextRequest) {
  return missingSecretResponse(request) ?? handlers.GET(request);
}

export async function POST(request: NextRequest) {
  return missingSecretResponse(request) ?? handlers.POST(request);
}
