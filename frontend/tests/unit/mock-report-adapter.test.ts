import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SAMPLE_REPORT_SHA256, buildSampleReportExtraction } from "@/fixtures/sample-report";
import { mockReportAdapter } from "@/lib/adapters/mock/report";
import { DEFAULT_DEMO_SCENARIOS, setDemoScenarios, type ReportOutcome } from "@/lib/adapters/mock/demo-scenarios";
import type { RequestScope, ReportJobStatus } from "@/lib/adapters/types";
import { isKnownFieldPath } from "@/lib/domain/fields";

const samplePath = new URL("../../public/samples/sample-dentist-report.pdf", import.meta.url);
const sampleBytes = readFileSync(samplePath);

function scope(overrides: Partial<RequestScope> = {}): RequestScope {
  return { analysisId: "a1", requestId: "r1", revision: 3, signal: new AbortController().signal, ...overrides };
}

function pdf(bytes: Uint8Array | Buffer, name = "report.pdf"): File {
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

async function runJob(file: File, isSample: boolean, outcome: ReportOutcome = "success"): Promise<ReportJobStatus> {
  setDemoScenarios({ report: outcome });
  const s = scope();
  const uploaded = await mockReportAdapter.upload({ file, isSample }, s);
  if (!uploaded.ok) throw new Error(uploaded.error.message);
  const polled = await mockReportAdapter.getJob(uploaded.value.jobId, s);
  if (!polled.ok) throw new Error(polled.error.message);
  return polled.value;
}

beforeEach(() => setDemoScenarios({ ...DEFAULT_DEMO_SCENARIOS, latencyScale: 0 }));
afterEach(() => setDemoScenarios({ ...DEFAULT_DEMO_SCENARIOS }));

describe("sample report fixture", () => {
  it("matches the bundled PDF's hash", () => {
    expect(createHash("sha256").update(sampleBytes).digest("hex")).toBe(SAMPLE_REPORT_SHA256);
  });

  it("proposes only known fields and never timing permission or eligibility", () => {
    const extraction = buildSampleReportExtraction({ reportId: "rep1", fileName: "sample.pdf", receivedAt: "2026-10-03T00:00:00Z" });
    const evidenceIds = new Set(extraction.evidence.map((item) => item.id));
    expect(extraction.proposals.length).toBeGreaterThan(0);
    for (const proposal of extraction.proposals) {
      expect(isKnownFieldPath(proposal.fieldPath)).toBe(true);
      expect(proposal.fieldPath).not.toMatch(/\.permission$|\.eligibilityConfirmed$/);
      expect(evidenceIds.has(proposal.evidenceId)).toBe(true);
    }
    expect(extraction.evidence.every((item) => item.kind === "pdf" && item.sourceId === "rep1" && item.pageNumber && item.literalQuote)).toBe(true);
    expect(extraction.missingFieldPaths.every((path) => path.startsWith("plan."))).toBe(true);
    expect(extraction.proposals.some((proposal) => proposal.fieldPath.startsWith("plan."))).toBe(false);
  });
});

describe("mock report adapter", () => {
  it("analyzes the labeled sample", async () => {
    const job = await runJob(pdf(sampleBytes, "sample-dentist-report.pdf"), true);
    expect(job.status).toBe("ready");
    expect(job.extraction?.proposals.length).toBeGreaterThan(0);
    expect(job.analysisId).toBe("a1");
    expect(job.requestId).toBe("r1");
    expect(job.revision).toBe(3);
    expect(job.progress).toBeNull();
  });

  it("recognizes the sample by its bytes even when not flagged", async () => {
    const job = await runJob(pdf(sampleBytes, "renamed.pdf"), false);
    expect(job.status).toBe("ready");
  });

  it("never returns sample results for another PDF", async () => {
    const other = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("different")]);
    const job = await runJob(pdf(other, "mine.pdf"), false);
    expect(job.status).toBe("needsInput");
    expect(job.extraction).toBeNull();
    expect(job.issues[0]).toMatchObject({ code: "UNAVAILABLE" });
    expect(job.issues[0].message).toContain("only the sample report");
  });

  it.each([
    ["unreadable", "needsInput", "UNREADABLE"],
    ["encrypted", "needsInput", "ENCRYPTED"],
    ["timeout", "failed", "TIMEOUT"],
  ] as const)("honors the %s scenario", async (outcome, status, code) => {
    const job = await runJob(pdf(sampleBytes), true, outcome);
    expect(job.status).toBe(status);
    expect(job.issues[0].code).toBe(code);
  });

  it("fails the upload for the network scenario", async () => {
    setDemoScenarios({ report: "network" });
    const result = await mockReportAdapter.upload({ file: pdf(sampleBytes), isSample: true }, scope());
    expect(result).toMatchObject({ ok: false, error: { code: "NETWORK", retryable: true } });
  });

  it("rejects oversized files at upload", async () => {
    const big = pdf(new Uint8Array(mockReportAdapter.limits.maxBytes + 1));
    const result = await mockReportAdapter.upload({ file: big, isSample: false }, scope());
    expect(result).toMatchObject({ ok: false, error: { code: "TOO_LARGE" } });
  });

  it("stops after cancelJob", async () => {
    const s = scope();
    const uploaded = await mockReportAdapter.upload({ file: pdf(sampleBytes), isSample: true }, s);
    if (!uploaded.ok) throw new Error("upload failed");
    await mockReportAdapter.cancelJob(uploaded.value.jobId);
    const polled = await mockReportAdapter.getJob(uploaded.value.jobId, s);
    expect(polled).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
  });

  it("aborts an upload through the scope signal", async () => {
    setDemoScenarios({ latencyScale: 1 });
    const controller = new AbortController();
    const pending = mockReportAdapter.upload({ file: pdf(sampleBytes), isSample: true }, scope({ signal: controller.signal }));
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
  });

  it("does not hand a job to another analysis", async () => {
    const uploaded = await mockReportAdapter.upload({ file: pdf(sampleBytes), isSample: true }, scope());
    if (!uploaded.ok) throw new Error("upload failed");
    const polled = await mockReportAdapter.getJob(uploaded.value.jobId, scope({ analysisId: "other" }));
    expect(polled).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
