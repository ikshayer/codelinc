import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import '../backend/scripts/load-env.ts';
import { getDatabase, closeDatabase } from '../backend/src/db/client.ts';
import { COLLECTIONS, DEMO_DATASET_ID, EXPANDED_DEMO_DATASET_ID } from '../backend/src/db/collections.ts';
import { memberExtraction } from '../frontend/src/lib/adapters/live/member-data.ts';
import type { MemberData } from '../frontend/src/lib/adapters/live/member-data.ts';

// Read-only ESM audit against the actual configured Atlas database and local servers.
const report: Record<string, unknown> = { date: '2026-10-04', databaseWrites: 0 };
const clean = (document: Record<string, unknown>) => {
  const { _id, ...rest } = document;
  void _id;
  // MongoDB BSON dates serialize to ISO strings at the HTTP boundary.
  return JSON.parse(JSON.stringify(rest));
};
async function read(base: string, path: string) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, `${base}${path} status`);
  return response.json();
}
try {
  const db = getDatabase();
  const [members, plans, cards, claims, providers, manifest] = await Promise.all([
    db.collection(COLLECTIONS.memberSnapshots).find({ dataset_id: EXPANDED_DEMO_DATASET_ID }).sort({ member_id: 1, observed_at: -1 }).toArray(),
    db.collection(COLLECTIONS.plans).find({ dataset_id: DEMO_DATASET_ID }).toArray(),
    db.collection(COLLECTIONS.procedureCards).find({ dataset_id: EXPANDED_DEMO_DATASET_ID }).toArray(),
    db.collection(COLLECTIONS.claims).find({ dataset_id: EXPANDED_DEMO_DATASET_ID }).sort({ service_date: -1, claim_id: 1 }).toArray(),
    db.collection(COLLECTIONS.providers).find({ dataset_id: EXPANDED_DEMO_DATASET_ID }).sort({ provider_id: 1 }).toArray(),
    db.collection(COLLECTIONS.datasets).findOne({ dataset_id: EXPANDED_DEMO_DATASET_ID }),
  ]);
  assert.equal(manifest?.status, 'ready');
  const seen = new Set<string>();
  const payloads = members.filter(m => {
    if (seen.has(m.member_id)) return false;
    seen.add(m.member_id);
    return true;
  }).map(member => ({
    synthetic_demo: true, dataset_id: EXPANDED_DEMO_DATASET_ID,
    member: clean(member),
    plan: clean(plans.find(p => p.plan_version_id === member.plan_version_id)!),
    procedure_card: cards.find(c => c.member_id === member.member_id) ? clean(cards.find(c => c.member_id === member.member_id)!) : null,
    claims: claims.filter(c => c.member_id === member.member_id).map(clean),
    procedure_catalog: manifest.procedure_catalog ?? [],
  }));
  assert.equal(payloads.length, 200);
  const counts = { membersMapped: 0, withPendingClaims: 0, withRollover: 0, withMaximumGap: 0, withoutTreatmentCard: 0, withOverflow: 0 };
  const sampleIds = new Set<string>();
  const categories = new Set<string>();
  for (const payload of payloads) {
    const data = payload as unknown as MemberData;
    const extraction = memberExtraction(data);
    const values = new Map(extraction.proposals.map(p => [p.fieldPath, p.value]));
    const codes = extraction.evidence.flatMap(e => e.blockingIssues ?? []).map(i => i.code);
    assert.equal(values.get('plan.y1.annualMaximum'), (data.plan.annual_maximum.individual_cents / 100).toFixed(2));
    assert.equal(values.get('plan.y1.alreadyUsed'), (data.member.benefit_state.plan_paid_ytd_cents / 100).toFixed(2));
    assert.equal(values.get('plan.y1.deductibleSatisfied'), ((data.plan.deductible.in_network.individual_cents - data.member.benefit_state.deductible_remaining_cents.in_network) / 100).toFixed(2));
    for (const category of ['preventive', 'basic', 'major']) {
      const rule = data.plan.coverage[category];
      if (rule) assert.equal(values.get(`plan.rules.${category}.insurerPercent`), String(rule.in_network_plan_share_bps / 100));
    }
    const pending = data.member.benefit_state.pending_claims.length > 0;
    const rollover = (data.member.benefit_state.rollover_bank_cents ?? 0) > 0;
    const maxGap = data.procedure_card?.procedures.slice(0, 4).some(p => p.dependencies.some(d => d.maximum_gap_days != null)) ?? false;
    assert.equal(codes.includes('PENDING_CLAIMS'), pending);
    assert.equal(codes.includes('ROLLOVER'), rollover);
    assert.equal(codes.includes('UNSUPPORTED_MAXIMUM_GAP'), maxGap);
    assert.equal(extraction.overflow?.length ?? 0, Math.max(0, (data.procedure_card?.procedures.length ?? 0) - 4));
    counts.membersMapped++;
    counts.withPendingClaims += Number(pending);
    counts.withRollover += Number(rollover);
    counts.withMaximumGap += Number(maxGap);
    counts.withoutTreatmentCard += Number(!data.procedure_card);
    counts.withOverflow += Number((extraction.overflow?.length ?? 0) > 0);
    for (const category of [String(data.member.member_id === 'SYN-MEMBER-0001'), `plan:${payload.member.plan_version_id}`, pending ? 'pending' : 'noPending', rollover ? 'rollover' : 'noRollover', maxGap ? 'maxGap' : 'noMaxGap', data.procedure_card ? 'card' : 'noCard', (extraction.overflow?.length ?? 0) > 0 ? 'overflow' : 'noOverflow']) {
      if (!categories.has(category)) { categories.add(category); sampleIds.add(data.member.member_id); }
    }
  }
  report.mapping = counts;
  report.memberSamples = [];
  for (const memberId of sampleIds) {
    const path = `/api/demo/members/${memberId}`;
    const [backend, frontend] = await Promise.all([read('http://127.0.0.1:3001', path), read('http://127.0.0.1:3000', path)]);
    const expected = payloads.find(p => p.member.member_id === memberId);
    assert.deepEqual(backend, expected, `${memberId}: backend must match stored records`);
    assert.deepEqual(frontend, backend, `${memberId}: frontend must preserve backend response`);
    (report.memberSamples as string[]).push(memberId);
  }
  for (const path of ['/api/demo/health', '/api/demo', '/api/demo/members', '/api/demo/providers', '/api/demo/members/DEMO-ALEX-001']) {
    const [backend, frontend] = await Promise.all([read('http://127.0.0.1:3001', path), read('http://127.0.0.1:3000', path)]);
    assert.deepEqual(frontend, backend, `${path}: proxy must preserve response`);
    if (path.endsWith('/providers')) assert.deepEqual(backend.providers, providers.map(clean));
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
  writeFileSync(new URL('live-atlas-check.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
