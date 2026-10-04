import type { AnalysisSnapshot } from "@/lib/domain/types";
import { requestJson } from "../shared";
import type { AdapterResult, HistoryPage, HistoryQuery, HistoryRepository, SaveSnapshotInput, SnapshotSummary } from "../types";

// Proposed backend contract (FRONTEND_DESIGN.md §15). Ownership is enforced by
// the server from the session; nothing here posts a user ID. A missing endpoint
// surfaces as an honest UNAVAILABLE error, never as sample data.

const BASE = "/api/analyses";
const JSON_HEADERS = { "Content-Type": "application/json", Accept: "application/json" } as const;

const detailUrl = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

export const liveHistoryRepository: HistoryRepository = {
  mode: "live",
  persistence: "account",

  list(query: HistoryQuery, signal: AbortSignal): Promise<AdapterResult<HistoryPage>> {
    const params = new URLSearchParams({ limit: String(query.limit) });
    if (query.search.trim()) params.set("search", query.search.trim());
    if (query.cursor) params.set("cursor", query.cursor);
    return requestJson<HistoryPage>(`${BASE}?${params}`, { signal, headers: { Accept: "application/json" } });
  },

  get(id: string, signal: AbortSignal): Promise<AdapterResult<AnalysisSnapshot>> {
    return requestJson<AnalysisSnapshot>(detailUrl(id), { signal, headers: { Accept: "application/json" } });
  },

  save(input: SaveSnapshotInput): Promise<AdapterResult<AnalysisSnapshot>> {
    return requestJson<AnalysisSnapshot>(BASE, {
      method: "POST",
      headers: { ...JSON_HEADERS, "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify(input.snapshot),
    });
  },

  rename(id: string, title: string): Promise<AdapterResult<SnapshotSummary>> {
    return requestJson<SnapshotSummary>(detailUrl(id), { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ title }) });
  },

  remove(id: string): Promise<AdapterResult<void>> {
    return requestJson<void>(detailUrl(id), { method: "DELETE", headers: { Accept: "application/json" } });
  },
};
