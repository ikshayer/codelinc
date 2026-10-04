import { getBackendDemo } from "@/lib/backend";

export async function GET() {
  return getBackendDemo("/api/demo/health");
}
