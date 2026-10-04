import { proxyBackend } from "@/lib/server/backend";

export async function POST(request: Request) {
  return proxyBackend("/api/demo/member-lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text(), signal: request.signal });
}
