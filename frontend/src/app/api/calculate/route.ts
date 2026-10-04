import { proxyBackend } from "@/lib/server/backend";

export async function POST(request: Request) {
  // Original intake/confirmation routes keep their category-based view model.
  // Calculation now reaches the deterministic backend rather than the data API scaffold.
  return proxyBackend("/api/calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
    signal: request.signal,
  }, process.env.CAREWINDOW_ENGINE_URL ?? "http://localhost:4000");
}
