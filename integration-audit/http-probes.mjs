import { writeFileSync } from 'node:fs';

const results = [];
const cases = [
  ['GET', '/api/demo/health'],
  ['GET', '/api/demo'],
  ['GET', '/api/demo/members'],
  ['GET', '/api/demo/members/SYN-MEMBER-0001'],
  ['GET', '/api/demo/members/DEMO-ALEX-001'],
  ['GET', '/api/demo/members/INVALID'],
  ['GET', '/api/demo/providers'],
  ['GET', '/api/auth/session'],
  ['GET', '/api/analyses'],
  ['POST', '/api/calculate', { requestId: 'integration-audit', analysisId: 'audit', revision: 0, scenario: {} }],
  ['POST', '//api/calculate', { requestId: 'integration-audit', analysisId: 'audit', revision: 0, scenario: {} }],
  ['POST', '/api/calculate', {}],
  ['POST', '/api/calculate', 'malformed JSON'],
  ['POST', '/api/interpret', { requestId: 'audit', draftRevision: 0, text: 'synthetic audit', syntheticDataAcknowledged: true }],
];
for (const base of ['http://127.0.0.1:3001', 'http://localhost:3000']) {
  for (const [method, path, payload] of cases) {
    const start = Date.now();
    try {
      const response = await fetch(base + path, {
        method,
        ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: typeof payload === 'string' ? payload : JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(20000),
      });
      const raw = await response.text();
      let body;
      try { body = JSON.parse(raw); } catch { body = { nonJson: true, prefix: raw.slice(0, 100) }; }
      const summary = {
        error: body.error,
        ok: body.ok,
        datasets: body.datasets,
        members: body.members?.length,
        providers: body.providers?.length,
        memberId: body.member?.member_id,
        planId: body.member?.plan_version_id,
        claims: body.claims?.length,
        procedures: body.procedure_card?.procedures?.length,
        counts: body.counts,
        nonJson: body.nonJson,
      };
      results.push({ method, path, base, status: response.status, elapsedMs: Date.now() - start, payload: method === 'POST' ? payload : undefined, summary });
    } catch (error) {
      results.push({ method, path, base, elapsedMs: Date.now() - start, failure: error.name });
    }
    console.log(JSON.stringify(results.at(-1)));
  }
}
if (process.argv[2]) writeFileSync(new URL(process.argv[2], import.meta.url), JSON.stringify(results, null, 2) + '\n');
