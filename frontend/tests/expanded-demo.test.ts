import assert from "node:assert/strict";
import test from "node:test";
import { generateExpandedDemoData, validateExpandedDemoData } from "../src/db/expanded-demo.js";

test("expanded population is deterministic and passes integrity validation", () => {
  const first = generateExpandedDemoData();
  const second = generateExpandedDemoData();
  assert.equal(first.manifest.checksum_sha256, second.manifest.checksum_sha256);
  assert.deepEqual(validateExpandedDemoData(first), []);
});

test("expanded population has useful demo scale and lifecycle diversity", () => {
  const data = generateExpandedDemoData();
  assert.equal(data.members.length, 200);
  assert.equal(data.providers.length, 32);
  assert.ok(data.priceQuotes.length >= 200);
  assert.ok(data.claims.length >= 350);
  assert.ok(data.appointments.length >= 320);
  assert.ok(data.procedureCards.length >= 90);

  const claimStatuses = new Set(data.claims.map((claim) => claim.status));
  assert.deepEqual([...claimStatuses].sort(), ["denied", "paid", "pending", "reversed"]);
  assert.ok(data.providers.some((provider) => provider.network_source_status === "STALE_DEMO"));
  assert.ok(data.providers.some((provider) => provider.network_source_status === "UNVERIFIED_DEMO"));
  assert.ok(data.providers.some((provider) => Object.values(provider.network_status_by_plan as object).includes("unknown")));
  assert.ok(data.priceQuotes.some((quote) => quote.verification_status === "STALE_DEMO"));
  assert.ok(data.procedureCards.some((card) => (card.unanswered_questions as unknown[]).length > 0));
});

test("every expanded member accumulator reconciles with paid claims", () => {
  const data = generateExpandedDemoData();
  for (const member of data.members) {
    const benefit = member.benefit_state as Record<string, number>;
    const paid = data.claims
      .filter((claim) => claim.member_id === member.member_id && claim.status === "paid")
      .reduce((sum, claim) => sum + (claim.plan_payment_cents as number), 0);
    assert.equal(paid, benefit.plan_paid_ytd_cents, String(member.member_id));
    assert.equal(benefit.annual_maximum_total_cents - paid, benefit.annual_maximum_remaining_cents);
  }
});
