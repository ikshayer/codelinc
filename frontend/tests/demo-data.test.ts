import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_DATASET_ID } from "../src/db/collections.js";
import { loadDentalDemoPackage } from "../src/db/demo-data.js";

test("loads and validates the complete synthetic dental package", async () => {
  const data = await loadDentalDemoPackage();
  assert.equal(data.registry.dataset_id, DEMO_DATASET_ID);
  assert.equal(data.registry.plans.length, 3);
  assert.equal(data.member.plan_version_id, "demo-core-dppo-2026-2027-v1");
  assert.equal(data.goldenScenarios.scenarios.length, 12);
  assert.match(data.sourceText, /Synthetic Demo Dental Benefit Schedule/);
});

test("all member plan references resolve", async () => {
  const data = await loadDentalDemoPackage();
  const versions = new Set(data.registry.plans.map((plan) => plan.plan_version_id));
  assert.ok(versions.has(data.member.plan_version_id));
});
