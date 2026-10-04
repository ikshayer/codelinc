import { proxyBackend } from "@/lib/server/backend";

export async function GET(request: Request) {
  return proxyBackend("/api/demo", { signal: request.signal });
}
