import { proxyBackend } from "@/lib/server/backend";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyBackend(`/api/demo/members/${encodeURIComponent(id)}`, { signal: request.signal });
}
