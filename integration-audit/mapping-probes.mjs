import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { memberExtraction } from '../frontend/src/lib/adapters/live/member-data.ts';
import { emptyDraft, applyProposals, editFact } from '../frontend/src/lib/domain/draft.ts';
import { buildConfirmedScenario } from '../frontend/src/lib/domain/scenario.ts';
import { generateExpandedDemoData } from '../backend/src/db/expanded-demo.ts';
import { listFrozen } from '../backend/scripts/frozen-files.mjs';

// Controlled synthetic inputs, never records fetched from Atlas.
const data = {
  member: { member_id: 'audit-member', display_name: 'Synthetic audit', observed_at: '2026-10-03T09:00:00-04:00', benefit_state: { benefit_year: 2026, plan_paid_ytd_cents: 48250, annual_maximum_remaining_cents: 101750, deductible_remaining_cents: { in_network: 2500 }, pending_claims: [{ claim_id: 'audit-pending', projected_plan_payment_cents: 25000 }], rollover_bank_cents: 20000 } },
  plan: { plan_version_id: 'audit-plan', display_name: 'Audit Core', effective_from: '2026-01-01', effective_to: '2027-12-31', deductible: { in_network: { individual_cents: 5000 } }, annual_maximum: { individual_cents: 150000, preventive_counts_toward_maximum: true }, coverage: Object.fromEntries([['preventive', 10000, false], ['basic', 8000, true], ['major', 5000, true]].map(([k, bps, applies]) => [k, { in_network_plan_share_bps: bps, deductible_applies: applies }])) },
  procedure_card: { procedure_card_id: 'audit-card', procedures: [1, 2, 3].map(n => ({ procedure_id: `proc-${n}`, cdt: 'D2392', label: `Audit filling ${n}`, dentist_estimated_fee_cents: 25499, target_by_date: `2026-11-0${n}`, earliest_safe_date: '2026-10-05', latest_safe_date: '2027-01-10', confirmation_status: 'UNVERIFIED_AI_EXTRACTION_DEMO', dependencies: [] })) },
  procedure_catalog: [{ cdt: 'D2392', service_class: 'basic' }], claims: [],
};
const results = {};
writeFileSync(new URL('controlled-member-payload.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
const extraction = memberExtraction(data);
const values = Object.fromEntries(extraction.proposals.map(p => [p.fieldPath, p.value]));
assert.equal(values['plan.y1.alreadyUsed'], '482.50');
assert.equal(values['plan.y1.deductibleSatisfied'], '25.00');
assert.equal(values['timing.p1.y1.latest'], '2026-12-31');
assert.equal(values['timing.p1.y2.earliest'], '2027-01-01');
assert.equal(values['care.p1.fee'], undefined);
assert.equal(values['care.p1.eligibilityConfirmed'], undefined);
assert.equal(values['timing.p1.permission'], undefined);
results.safeImport = 'PASS: cents/basis-point conversion, intersected windows, missing fee/eligibility/timing remain unconfirmed';

let draft = applyProposals(emptyDraft(), extraction.proposals, extraction.evidence);
for (const [path, value] of Object.entries({ 'plan.y2.alreadyUsed': '0', 'plan.y2.deductibleSatisfied': '0', 'plan.y2.rulesUnchanged': true })) draft = editFact(draft, path, value);
for (const id of draft.procedureIds) {
  for (const [field, value] of Object.entries({ fee: '254.99', eligibilityConfirmed: true })) draft = editFact(draft, `care.${id}.${field}`, value);
  draft = editFact(draft, `timing.${id}.permission`, 'dentistApproved');
}
const built = buildConfirmedScenario(draft);
assert.equal(built.ok, true, JSON.stringify(built.issues));
results.unsupportedState = { importedPendingClaims: data.member.benefit_state.pending_claims.length, importedRolloverCents: data.member.benefit_state.rollover_bank_cents, scenarioPendingClaims: built.scenario.plan.years[0].utilization.pendingClaims, scenarioRollover: built.scenario.plan.rollover, validationNotices: built.notices, scenarioPlanId: built.scenario.plan.id, scenarioContainsMemberId: JSON.stringify(built.scenario).includes(data.member.member_id) };

const withMultiple = structuredClone(data);
withMultiple.procedure_card.procedures[2].dependencies = [{ procedure_id: 'proc-1', minimum_gap_days: 7 }, { procedure_id: 'proc-2', minimum_gap_days: 14 }];
const multiple = Object.fromEntries(memberExtraction(withMultiple).proposals.map(p => [p.fieldPath, p.value]));
results.multipleDependencies = { backendDependencies: 2, frontendAfterField: multiple['timing.p3.after'] ?? null, frontendMinGapDays: multiple['timing.p3.minGapDays'] ?? null };

const withMaximum = structuredClone(data);
withMaximum.procedure_card.procedures[1].dependencies = [{ procedure_id: 'proc-1', minimum_gap_days: 7, maximum_gap_days: 30 }];
const maximum = Object.fromEntries(memberExtraction(withMaximum).proposals.map(p => [p.fieldPath, p.value]));
results.maximumGap = { backendMinDays: 7, backendMaxDays: 30, frontendMinDays: maximum['timing.p2.minGapDays'], anyMaximumGapField: Object.keys(maximum).some(k => /max.*gap/i.test(k)) };

const generated = generateExpandedDemoData();
results.generatedCorpus = { source: 'local deterministic generator, not Atlas', members: generated.members.length, membersWithPendingClaims: generated.members.filter(m => m.benefit_state.pending_claims.length > 0).length, membersWithRollover: generated.members.filter(m => m.benefit_state.rollover_bank_cents > 0).length, dependenciesWithMaximumGap: generated.procedureCards.flatMap(c => c.procedures).flatMap(p => p.dependencies).filter(d => d.maximum_gap_days !== undefined).length };

const root = new URL('../backend/', import.meta.url);
const manifest = readFileSync(new URL('docs/contracts/FROZEN.sha256', root), 'utf8');
const actual = new Map(listFrozen(root.pathname.replace(/^\//, '')).map(path => [path, createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex')]));
const expected = new Map(manifest.split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => { const [hash, ...path] = l.split('  '); return [path.join('  '), hash]; }));
const normalizedHashes = new Map([...actual.keys()].map(path => [path, createHash('sha256').update(readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
results.frozenManifest = { crlf: manifest.includes('\r\n'), expectedFiles: expected.size, actualFiles: actual.size, removedAfterNormalizingCRLF: [...expected.keys()].filter(path => !actual.has(path)), addedAfterNormalizingCRLF: [...actual.keys()].filter(path => !expected.has(path)), changedAfterNormalizingCRLF: [...expected].filter(([path, hash]) => actual.has(path) && actual.get(path) !== hash).map(([path]) => path) };
results.frozenManifest.changedAfterNormalizingFileContents = [...expected].filter(([path, hash]) => normalizedHashes.has(path) && normalizedHashes.get(path) !== hash).map(([path]) => path);
console.log(JSON.stringify(results, null, 2));
writeFileSync(new URL('mapping-probes.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
