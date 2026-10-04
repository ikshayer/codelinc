// PLANNER-OWNED. Independent brute-force golden checker (workflow: re-run whenever a golden number,
// fixture or ranking rule changes). Derived only from the spec, data/sources/*.md (plan rules read by
// hand below) and fixtures — it never imports src/. Enumerates every schedule (incl. "unscheduled"),
// applies CONTRACT §3 adjudication, §5.4 funding and §5.5 ranking, prints each case and asserts
// fixtures/golden/expected.json to the cent.
//   node scripts/golden-check.mjs            # current contract rules (default; 1.2 added route comparisons, §5.9; 1.4 changes no number)
//   CONTRACT_RULES=1.0.0 node scripts/golden-check.mjs   # shows the 1.0.0 pass-1 bug (assertions fail)
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const V10 = process.env.CONTRACT_RULES === "1.0.0";

const ROOT = process.argv[2] ?? path.resolve(import.meta.dirname, "..");
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const CURRENT = /CONTRACT_VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "src/domain/version.ts"), "utf8"))?.[1];
const clone = (x) => structuredClone(x);

// ---- dates (epoch days, no zone) ----
const ed = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
const diff = (a, b) => ed(b) - ed(a);
const wd = (d) => new Date(ed(d) * 864e5).getUTCDay(); // 0 = Sunday
const ym = (d) => d.slice(0, 7);

// ---- plan rules, read by hand from data/sources (2026 p2-p5, 2027 same except noted) ----
const CLASS = { D0120: "dp", D0140: "dp", D0150: "dp", D0210: "dp", D0220: "dp", D0274: "dp", D1110: "dp",
  D2140: "basic", D2391: "basic", D2392: "basic", D3330: "basic", D2740: "major", D2750: "major", D2950: "major", D6010: "major" };
const RATE = { in_network: { dp: 10000, basic: 8000, major: 5000 }, out_of_network: { dp: 8000, basic: 6000, major: 4000 } };
const OON_ALLOW = { D0120: 4000, D0140: 6500, D0150: 7500, D0210: 9000, D0220: 2500, D1110: 7000, D2392: 15000, D3330: 90000, D2740: 95000 };
const PLAN = {
  2026: { ded: 5000, max: 150000, selfPay: true, start: "2026-01-01", end: "2026-12-31" },
  2027: { ded: 7500, max: 150000, selfPay: null /* claim submission not addressed -> UNKNOWN */, start: "2027-01-01", end: "2027-12-31" },
};
const DED_CLASSES = new Set(["basic", "major"]);
const MAX_CLASSES = new Set(["basic", "major"]);
// Frequency: crowns 1/tooth/60mo (2026); 2027 CONFLICT 60 vs 84 (page 4 table vs Note 4) -> blocks crown lines in 2027.
// Evaluations D0120/D0140/D0150 2 per benefit period combined. D2392/D3330/D0220: none.
const yearOf = (d) => +d.slice(0, 4);
// (1.5) 2026 Maximum Carryover Rider (data/sources/northwind-ppo-2026-carryover-rider.md), read by hand:
const ROLLOVER_2026 = {
  threshold: 50000, // p1 "...that count toward the annual maximum total less than $500." + "A total of exactly $500 does not earn a carryover."
  strict: true, // "less than" (exactly $500 does not earn)
  award: 25000, // p1 "The carryover earned is $250."
  bonus: 0, // p1 "There is no additional in-network bonus."
  cap: 100000, // p2 "The carryover balance may not exceed $1,000; any amount above $1,000 is not carried over."
  needsClaim: true, // p1 "At least one claim with a plan payment that counts toward the annual maximum must be paid..."
  // p2 "If no carryover is earned for a benefit period, the carryover balance does not continue..." (forfeit)
  // p2 "...applies only if the member is enrolled on January 1, 2027 in ... (plan version nwd-ppo-standard-2027)" — the 2027 plan exists.
};
const rp = (m) => Math.floor((m.x * m.bps + 5000) / 10000);

// ---- money inputs (scenario resolution) ----
const val = (inp, dir, scen) => {
  if (!inp) return null;
  const v = inp.value;
  if (v.kind === "exact") return v.cents;
  if (v.kind === "range") {
    const worseHigh = dir === "higher_is_worse";
    return (scen === "worst") === worseHigh ? v.max_cents ?? v.high_cents : v.min_cents ?? v.low_cents;
  }
  return null;
};

function adjudicate(events, member, providers, scen, asOfDate) {
  // events sorted chronologically by caller
  const periods = {};
  const open = (y) => {
    if (periods[y]) return periods[y];
    const pv = `nwd-ppo-standard-${y}`;
    const acc = member.accumulators.find((a) => a.plan_version_id === pv);
    let dedRem, maxRem;
    if (acc) { dedRem = val(acc.deductible_remaining, "higher_is_worse", scen); maxRem = val(acc.annual_max_remaining, "higher_is_better", scen); }
    else if (PLAN[y].start > asOfDate) { dedRem = PLAN[y].ded; maxRem = PLAN[y].max; }
    else return (periods[y] = { blocked: "INPUT_MISSING" });
    let rMax = 0, rDed = 0;
    for (const c of member.pending_claims.filter((c) => c.plan_version_id === pv)) {
      rMax += val(c.estimated_plan_pay, "higher_is_worse", scen);
      rDed += val(c.estimated_deductible_applied, "higher_is_better", scen);
    }
    return (periods[y] = { dedRem, maxRem, rMax, rDed, dedAvail: Math.max(0, dedRem - rDed), maxAvail: Math.max(0, maxRem - rMax) });
  };
  const lines = [];
  const crownHist = [...member.procedure_history.filter((h) => h.claimed)];
  for (const e of events) {
    const y = yearOf(e.date);
    const P = PLAN[y];
    const prov = providers.find((p) => p.provider_id === e.provider_id);
    const price = prov.pricing.find((r) => r.cdt_code === e.code);
    const st = open(y);
    if (st.blocked) return { blocked: st.blocked };
    if (e.route === "SELF_PAY_NO_CLAIM") {
      if (P.selfPay !== true) return { blocked: "RULE_UNKNOWN claim_submission." + y };
      if (prov.self_pay.permitted_by_office !== true) return { blocked: "SELF_PAY_NOT_VERIFIED" };
      const cash = price.cash_quote?.value.kind === "exact" ? price.cash_quote.value.cents : null;
      if (cash == null) return { blocked: "SELF_PAY_NOT_VERIFIED" };
      lines.push({ ...e, charge: cash, adj: 0, elig: null, ded: 0, rate: null, prelim: null, plan: 0, member: cash, cap: "none", bb: 0, state: { ...st } });
      continue;
    }
    if (process.env.NO_MAX_2026 && y === 2026) return { blocked: "RULE_MISSING rules.annual_maximum" };
    const cls = CLASS[e.code];
    if (["D2740", "D2750"].includes(e.code)) {
      if (y === 2027) return { blocked: "RULE_CONFLICT frequency crowns 2027" };
      if (crownHist.some((h) => ["D2740", "D2750"].includes(h.cdt_code) && h.tooth === e.tooth && diff(h.service_date, e.date) < 0 /*approx*/)) return { notCovered: true };
    }
    const charge = val(price.provider_charge, "higher_is_worse", scen);
    if (charge == null) return { blocked: "charge unknown" };
    let patient, elig, adj, bb;
    if (prov.network.tier === "in_network") {
      const allowed = val(price.contracted_allowed, "higher_is_worse", scen);
      if (allowed == null) return { blocked: "ALLOWED_AMOUNT_UNKNOWN" };
      patient = elig = allowed; adj = charge - allowed; bb = 0;
    } else {
      const allow = OON_ALLOW[e.code];
      if (allow == null) return { blocked: "RULE_MISSING oon" };
      elig = Math.min(charge, allow); patient = charge; adj = 0; bb = charge - elig; // balance billing permitted
    }
    const ded = DED_CLASSES.has(cls) ? Math.min(st.dedAvail, elig) : 0;
    const rate = RATE[prov.network.tier][cls];
    const prelim = rp({ x: elig - ded, bps: rate });
    const counts = MAX_CLASSES.has(cls);
    const plan = counts ? Math.min(prelim, st.maxAvail) : prelim;
    const cap = plan < prelim ? "annual_maximum" : "none";
    st.dedRem -= ded; st.dedAvail -= ded;
    if (counts) { st.maxRem -= plan; st.maxAvail -= plan; }
    crownHist.push({ cdt_code: e.code, tooth: e.tooth, service_date: e.date, claimed: true });
    lines.push({ ...e, charge, adj, elig, ded, rate, prelim, plan, member: patient - plan, cap, bb, counts, state: { ...st } });
  }
  return { lines, rollover: carryover2026(lines, member, scen, asOfDate) };
}

// (1.5) 2026 year close (CONTRACT §3.9), from the rider above. Basis: plan payments counting toward the maximum.
function carryover2026(lines, member, scen, asOfDate) {
  const R = ROLLOVER_2026;
  const acc = member.accumulators.find((a) => a.plan_version_id === "nwd-ppo-standard-2026");
  if (!acc) return null;
  const settled = val(acc.plan_paid_ytd, "higher_is_worse", scen);
  const pending = member.pending_claims.filter((c) => c.plan_version_id === "nwd-ppo-standard-2026")
    .reduce((t, c) => t + (c.estimated_plan_pay.value.kind === "exact" ? c.estimated_plan_pay.value.cents : c.estimated_plan_pay.value.high_cents), 0);
  const simulated = lines.filter((l) => yearOf(l.date) === 2026 && l.counts).reduce((t, l) => t + l.plan, 0);
  const prior = acc.carryover_balance ? val(acc.carryover_balance, "higher_is_better", scen) : null;
  const lo = settled + simulated, hi = lo + pending;
  const under = (q) => (R.strict ? q < R.threshold : q <= R.threshold);
  const paidLo = !R.needsClaim || settled > 0 || simulated > 0, paidHi = paidLo || pending > 0;
  const best = under(lo) && paidHi, worst = under(hi) && paidLo;
  const bank = Math.min(R.cap, prior + R.award + R.bonus);
  const final_bank = { low_cents: worst ? bank : 0, high_cents: best ? bank : 0 };
  const status = final_bank.low_cents !== final_bank.high_cents ? "UNCERTAIN" : !best ? "NOT_EARNED" : asOfDate > "2026-12-31" && pending === 0 ? "EARNED" : "CONDITIONAL";
  return {
    closing_plan_version_id: "nwd-ppo-standard-2026", status, threshold_cents: R.threshold, settled_plan_paid_cents: settled, pending_plan_pay_cents: pending,
    qualifying_plan_paid: { low_cents: lo, high_cents: hi }, final_bank,
    lost_to_cap_cents: best ? Math.max(0, prior + R.award + R.bonus - R.cap) : 0, forfeited_cents: worst ? 0 : prior,
  };
}

function fund(lines, member) {
  const used = {}; const cashByMonth = {}; const monthsAny = new Set();
  let gap = 0; const out = [];
  const fsas = member.funding_accounts.filter((a) => a.type === "FSA" || a.type === "HRA")
    .sort((a, b) => (a.eligible_service_through ?? "9999") < (b.eligible_service_through ?? "9999") ? -1 : (a.eligible_service_through ?? "9999") > (b.eligible_service_through ?? "9999") ? 1 : a.source_id < b.source_id ? -1 : 1);
  const hsas = member.funding_accounts.filter((a) => a.type === "HSA");
  const hard = member.budget.hard_monthly_limit_cents;
  for (const l of lines) {
    let R = l.member; const f = [];
    for (const a of fsas) {
      if (R <= 0) break;
      if (!((a.eligible_service_from ?? "0000") <= l.date && l.date <= (a.eligible_service_through ?? "9999"))) continue;
      const take = Math.min(R, val(a.balance, "higher_is_better", "worst") - (used[a.source_id] ?? 0));
      if (take > 0) { used[a.source_id] = (used[a.source_id] ?? 0) + take; R -= take; f.push(["FSA", a.source_id, take]); }
    }
    const m = ym(l.date);
    const cashTake = Math.min(R, hard - (cashByMonth[m] ?? 0));
    if (cashTake > 0) { cashByMonth[m] = (cashByMonth[m] ?? 0) + cashTake; R -= cashTake; f.push(["CASH", "cash", cashTake]); }
    for (const a of hsas) {
      const take = Math.min(R, val(a.balance, "higher_is_better", "worst") - a.reserve_cents - (used[a.source_id] ?? 0));
      if (take > 0) { used[a.source_id] = (used[a.source_id] ?? 0) + take; R -= take; f.push(["HSA", a.source_id, take]); }
    }
    if (f.length) monthsAny.add(m);
    gap += R; out.push({ ...l, funding: f, shortfall: R });
  }
  return { lines: out, gap, monthly: [...monthsAny].sort().map((mm) => ({ month: mm, cash: cashByMonth[mm] ?? 0 })), used };
}

function careplan(member, providers, procs, asOf, horizon) {
  const asOfDate = asOf.slice(0, 10); // golden as_of 21:00Z = 17:00 EDT same date
  const available = (s) => {
    if (member.availability.unavailable.some((u) => u.start <= s.date && s.date <= u.end)) return false;
    return member.availability.weekly.some((w) => w.weekday === wd(s.date) && w.start_time <= s.start_time && s.end_time <= w.end_time);
  };
  const URG = { act_now: 0, schedule_soon: 1, can_plan_later: 2 };
  const order = [...procs].sort((a, b) => URG[a.urgency] - URG[b.urgency] || (a.procedure_id < b.procedure_id ? -1 : 1));
  const cands = {};
  for (const p of order) {
    cands[p.procedure_id] = [];
    for (const pr of [...providers].sort((a, b) => a.provider_id < b.provider_id ? -1 : 1)) {
      if (!p.allowed_specialties.includes(pr.specialty)) continue;
      if (pr.travel.distance_miles > member.travel.hard_max_miles) continue;
      const price = pr.pricing.find((r) => r.cdt_code === p.cdt_code);
      if (!price) continue;
      for (const s of pr.slots.items) {
        if (s.kind !== "treatment" || s.date <= asOfDate) continue;
        if (s.date < p.earliest_safe_date || s.date > (p.latest_safe_date < horizon ? p.latest_safe_date : horizon)) continue;
        if (!available(s)) continue;
        const routes = [pr.network.tier === "in_network" ? "IN_NETWORK_CLAIM" : "OUT_OF_NETWORK_CLAIM"];
        if (price.cash_quote) routes.push("SELF_PAY_NO_CLAIM");
        for (const route of routes) cands[p.procedure_id].push({ provider_id: pr.provider_id, slot: s, route, travel: pr.travel.travel_minutes });
      }
    }
  }
  let selfPayRejected = 0; const schedules = []; const blockedU = []; let blockedCount = 0; const blockedWhy = {};
  const pick = {};
  const rec = (i) => {
    if (i === order.length) { evalSched(); return; }
    const p = order[i];
    for (const c of [null, ...cands[p.procedure_id]]) {
      if (c && order.slice(0, i).map((q) => pick[q.procedure_id]).some((q) => q && q.provider_id === c.provider_id && q.slot.slot_id === c.slot.slot_id)) continue;
      // dependencies (predecessors earlier in `order` here; generic check at eval)
      pick[p.procedure_id] = c; rec(i + 1);
    }
    delete pick[p.procedure_id];
  };
  const evalSched = () => {
    for (const p of order) for (const d of p.dependencies) {
      const me = pick[p.procedure_id]; if (!me) continue;
      const pred = pick[d.depends_on]; if (!pred) return;
      const g = diff(pred.slot.date, me.slot.date);
      if (g < d.min_gap_days || g > d.max_gap_days) return;
    }
    const ev = order.filter((p) => pick[p.procedure_id]).map((p) => ({ pid: p.procedure_id, code: p.cdt_code, tooth: p.tooth, date: pick[p.procedure_id].slot.date, start: pick[p.procedure_id].slot.start_time, slot_id: pick[p.procedure_id].slot.slot_id, provider_id: pick[p.procedure_id].provider_id, route: pick[p.procedure_id].route, travel: pick[p.procedure_id].travel }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.pid.localeCompare(b.pid));
    const adj = adjudicate(ev, member, providers, "worst", asOfDate);
    if (adj.blocked) { const ub = [0, 0, 0]; for (const p of order) if (!pick[p.procedure_id]) ub[URG[p.urgency]]++; blockedU.push(ub); blockedCount++; blockedWhy[adj.blocked] = (blockedWhy[adj.blocked] ?? 0) + 1; return; }
    const f = fund(adj.lines, member);
    if (!V10) {
      // 1.1.0: each self-pay event must beat the same schedule with that event as a claim (spec §8 whole horizon)
      const cost = (evs) => { const a = adjudicate(evs, member, providers, "worst", asOfDate); return a.blocked ? null : fund(a.lines, member).lines.reduce((t, l) => t + l.member, 0); };
      const mine = f.lines.reduce((t, l) => t + l.member, 0);
      for (let k = 0; k < ev.length; k++) if (ev[k].route === "SELF_PAY_NO_CLAIM") {
        const tier = providers.find((p) => p.provider_id === ev[k].provider_id).network.tier === "in_network" ? "IN_NETWORK_CLAIM" : "OUT_OF_NETWORK_CLAIM";
        const c = cost(ev.map((e, j) => (j === k ? { ...e, route: tier } : e)));
        if (c === null || c <= mine) { selfPayRejected++; return; }
      }
    }
    const unsched = [0, 0, 0], late = [0, 0, 0];
    for (const p of order) {
      const c = pick[p.procedure_id];
      if (!c) unsched[URG[p.urgency]]++; else late[URG[p.urgency]] += Math.max(0, diff(p.target_date, c.slot.date));
    }
    const visits = new Map(); for (const e of ev) visits.set(e.provider_id + "|" + e.date, e.travel);
    const fsaUnused = member.funding_accounts.filter((a) => (a.type === "FSA" || a.type === "HRA") && a.eligible_service_through && a.eligible_service_through <= horizon)
      .reduce((s, a) => s + val(a.balance, "higher_is_better", "worst") - (f.used[a.source_id] ?? 0), 0);
    const obj = {
      unsched, late, shortfall: f.gap,
      cost: f.lines.reduce((s, l) => s + l.member, 0),
      peak: Math.max(0, ...f.monthly.map((m) => m.cash)),
      travel: [...visits.values()].reduce((s, x) => s + x, 0),
      visitDays: new Set(ev.map((e) => e.date)).size,
      wait: ev.reduce((s, e) => s + diff(asOfDate, e.date), 0),
      unused: fsaUnused,
      completion: ev.length ? ev.map((e) => e.date).sort().at(-1) : "9999-12-31",
      tie: [...order.map((p) => pick[p.procedure_id]?.slot.date ?? "9999-12-31"), ...order.map((p) => pick[p.procedure_id]?.provider_id ?? ""), ...order.map((p) => pick[p.procedure_id]?.route ?? ""), ...order.map((p) => pick[p.procedure_id]?.slot.slot_id ?? "")],
    };
    schedules.push({ ev: f.lines, obj, monthly: f.monthly, gap: f.gap, rollover: adj.rollover });
  };
  rec(0);
  const cmp = (keys) => (a, b) => {
    for (const k of keys) {
      const x = k(a.obj), y = k(b.obj);
      const xs = Array.isArray(x) ? x : [x], ys = Array.isArray(y) ? y : [y];
      for (let i = 0; i < xs.length; i++) if (xs[i] !== ys[i]) return xs[i] < ys[i] ? -1 : 1;
    }
    return 0;
  };
  const o = (n) => (v) => v[n];
  const KEYS = {
    lowest_total_cost: [o("unsched"), o("late"), o("shortfall"), o("cost"), o("peak"), o("travel"), o("visitDays"), o("wait"), o("unused"), o("tie")],
    earliest_safe_completion: [o("unsched"), o("late"), o("shortfall"), o("completion"), o("cost"), o("peak"), o("travel"), o("visitDays"), o("wait"), o("unused"), o("tie")],
    smoothest_monthly_payments: [o("unsched"), o("late"), o("shortfall"), o("peak"), o("cost"), o("travel"), o("visitDays"), o("wait"), o("unused"), o("tie")],
  };
  // CONTRACT 1.0.0: pool = shortfall-0 schedules, else all. MODE=v11: one pool; shortfall ranks after unscheduled+lateness.
  let pool, pass;
  if (!V10) {
    // 1.1.0: pass 1 = shortfall 0 AND no more unscheduled care than the best achievable (U*); else pass 2 = all.
    const key = (s) => s.obj.unsched.join(",");
    const uStar = [...schedules].sort((a, b) => { for (let i = 0; i < 3; i++) if (a.obj.unsched[i] !== b.obj.unsched[i]) return a.obj.unsched[i] - b.obj.unsched[i]; return 0; })[0];
    pool = schedules.filter((s) => s.gap === 0 && key(s) === key(uStar)); pass = 1;
    if (!pool.length) { pool = schedules; pass = 2; }
  }
  else { pool = schedules.filter((s) => s.gap === 0); pass = 1; if (!pool.length) { pool = schedules; pass = 2; } }
  const lexU = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  const uOk = schedules.map((x) => x.obj.unsched).sort(lexU)[0];
  const uAll = [...schedules.map((x) => x.obj.unsched), ...blockedU].sort(lexU)[0];
  if (!V10 && lexU(uOk, uAll) > 0) return { count: schedules.length, blockedCount, blockedWhy, fullCount: 0, pass: "NEEDS_CONFIRMATION (U_ok=" + uOk + " > U_all=" + uAll + ")", alts: [] };
  const alts = [];
  for (const [label, keys] of Object.entries(KEYS)) {
    const best = [...pool].sort(cmp(keys))[0];
    const ex = alts.find((a) => a.s === best);
    if (ex) ex.labels.push(label); else alts.push({ s: best, labels: [label] });
  }
  return { count: schedules.length, selfPayRejected, blockedCount, blockedWhy, fullCount: schedules.filter((s) => s.obj.unsched.every((x) => x === 0)).length, pass, alts, cands, order };
}

function show(r) {
  console.log(`  feasible schedules: ${r.count} (all scheduled: ${r.fullCount}); disqualified by NEEDS_CONFIRMATION lines: ${r.blockedCount} ${JSON.stringify(r.blockedWhy)}; pass ${r.pass}; self-pay rejected as not cheaper: ${r.selfPayRejected ?? "-"}`);
  for (const [i, a] of r.alts.entries()) {
    const o = a.s.obj;
    console.log(`  alt-${i + 1} [${a.labels.join(",")}] cost=${o.cost} gap=${o.shortfall} peak=${o.peak} late=${o.late} unsched=${o.unsched} travel=${o.travel} visits=${o.visitDays} wait=${o.wait} unused=${o.unused} completion=${o.completion}`);
    for (const l of a.s.ev) console.log(`     ${l.date} ${l.pid.padEnd(13)} ${l.slot_id.padEnd(30)} ${l.route.padEnd(20)} charge=${l.charge} adj=${l.adj} elig=${l.elig} ded=${l.ded} rate=${l.rate} prelim=${l.prelim} plan=${l.plan} cap=${l.cap} you=${l.member} bb=${l.bb} maxAvail→${l.state.maxAvail} dedRem→${l.state.dedRem} | ${l.funding.map((f) => f.join(":")).join(" ")}${l.shortfall ? " SHORT " + l.shortfall : ""}`);
    console.log(`     monthly ${JSON.stringify(a.s.monthly)}`);
    if (a.s.rollover) console.log(`     rollover 2026 ${a.s.rollover.status} qualifying=${JSON.stringify(a.s.rollover.qualifying_plan_paid)} final_bank=${JSON.stringify(a.s.rollover.final_bank)}`);
  }
}

// ---- previsit navigator (pricing + slot choice only) ----
function previsit(member, providers, asOf, codes) {
  const asOfDate = asOf.slice(0, 10);
  for (const pr of [...providers].sort((a, b) => a.provider_id.localeCompare(b.provider_id))) {
    if (pr.travel.distance_miles > member.travel.hard_max_miles) { console.log(`  ${pr.provider_id}: excluded TRAVEL_LIMIT_EXCEEDED`); continue; }
    const ok = pr.slots.items.filter((s) => s.kind === "exam" && s.date > asOfDate &&
      !member.availability.unavailable.some((u) => u.start <= s.date && s.date <= u.end) &&
      member.availability.weekly.some((w) => w.weekday === wd(s.date) && w.start_time <= s.start_time && s.end_time <= w.end_time))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time) || a.slot_id.localeCompare(b.slot_id));
    if (!ok.length) { console.log(`  ${pr.provider_id}: AVAILABILITY_NO_INTERSECTION`); continue; }
    const s = ok[0];
    const route = pr.network.tier === "in_network" ? "IN_NETWORK_CLAIM" : "OUT_OF_NETWORK_CLAIM";
    const ev = [...codes].sort().map((code) => ({ pid: "visit-" + code.toLowerCase(), code, tooth: null, date: s.date, start: s.start_time, slot_id: s.slot_id, provider_id: pr.provider_id, route }));
    const a = adjudicate(ev, member, providers, "worst", asOfDate);
    if (a.blocked) { console.log(`  ${pr.provider_id}: NEEDS_CONFIRMATION ${a.blocked}`); continue; }
    const tot = a.lines.reduce((t, l) => ({ charge: t.charge + l.charge, plan: t.plan + l.plan, you: t.you + l.member }), { charge: 0, plan: 0, you: 0 });
    (previsit.out ??= []).push({ provider_id: pr.provider_id, slot_id: s.slot_id, plan: tot.plan, you: tot.you, charge: tot.charge, lines: a.lines });
    console.log(`  ${pr.provider_id} ${s.slot_id} days_until=${diff(asOfDate, s.date)} charge=${tot.charge} plan=${tot.plan} you=${tot.you} miles=${pr.travel.distance_miles} min=${pr.travel.travel_minutes}`);
    for (const l of a.lines) console.log(`     ${l.code} charge=${l.charge} adj=${l.adj} elig=${l.elig} bb=${l.bb} rate=${l.rate} plan=${l.plan} you=${l.member} counts=${l.counts}`);
  }
}

const member0 = J("fixtures/synthetic/member.json");
const provPre = J("fixtures/synthetic/providers.previsit.json");
const provPost = J("fixtures/synthetic/providers.postvisit.json");
const procs0 = J("fixtures/synthetic/procedures.confirmed.json");
const sc = J("fixtures/synthetic/scenario.json");

console.log("== PREVISIT", sc.previsit_as_of);
previsit(member0, provPre, sc.previsit_as_of, sc.visit_defaults.expected_codes_by_intent.new_concern);

const R = {};
const run = (name, mut = () => {}) => {
  if (name.startsWith("missing annual")) process.env.NO_MAX_2026 = "1"; else delete process.env.NO_MAX_2026;
  const m = clone(member0), pv = clone(provPost), pr = clone(procs0);
  mut(m, pv, pr);
  console.log(`\n== CAREPLAN ${name}`);
  const r = careplan(m, pv, pr, sc.postvisit_as_of, sc.planning_horizon_end);
  show(r);
  r.inputs = { m, pv };
  return r;
};
R.base = run("base");
R.budget_hard_limit_4000 = run("budget_hard_limit_4000", (m) => { m.budget.hard_monthly_limit_cents = 4000; });
R.no_tuesday_availability = run("no_tuesday_availability", (m) => { m.availability.weekly = m.availability.weekly.filter((w) => w.weekday !== 2); });
R.office_self_pay_unknown = run("office_self_pay_unknown", (m, pv) => { pv.find((p) => p.provider_id === "prov-rivera").self_pay.permitted_by_office = null; });
R.no_pending_claims = run("no_pending_claims", (m) => { m.pending_claims = []; });
R.filling_this_year_only = run("filling_this_year_only", (m, pv, pr) => { const f = pr.find((p) => p.procedure_id === "proc-fill-14"); f.target_date = f.latest_safe_date = "2026-12-31"; });
run("pending_range_6000_7600 (golden-scenario.md only)", (m) => { m.pending_claims[0].estimated_plan_pay.value = { kind: "range", low_cents: 6000, high_cents: 7600 }; });
{ // best-case re-simulation of alt-1 for the range variant
  const m = clone(member0); m.pending_claims[0].estimated_plan_pay.value = { kind: "range", low_cents: 6000, high_cents: 7600 };
  const r = careplan(m, clone(provPost), clone(procs0), sc.postvisit_as_of, sc.planning_horizon_end);
  const ev = r.alts[0].s.ev.map(({ pid, code, tooth, date, start, slot_id, provider_id, route }) => ({ pid, code, tooth, date, start, slot_id, provider_id, route }));
  const best = adjudicate(ev, m, provPost, "best", "2026-10-15");
  console.log("  range best_case alt-1:", best.lines.map((l) => `${l.pid} plan=${l.plan} you=${l.member}`).join(" | "), "total you=", best.lines.reduce((s, l) => s + l.member, 0));
}

R.missing_max = run("missing annual_maximum.2026 (AT-01)", () => {});
// (1.5) A member just under the $500 carryover threshold with only the flexible filling left.
R.rollover_near_threshold = run("rollover_near_threshold", (m, pv, pr) => {
  const a = m.accumulators.find((x) => x.plan_version_id === "nwd-ppo-standard-2026");
  a.deductible_remaining.value = { kind: "exact", cents: 0 };
  a.annual_max_remaining.value = { kind: "exact", cents: 108000 };
  a.plan_paid_ytd.value = { kind: "exact", cents: 42000 };
  a.carryover_balance.value = { kind: "exact", cents: 0 };
  m.pending_claims = [];
  pr.splice(0, pr.length, ...pr.filter((p) => p.procedure_id === "proc-fill-14"));
});

// ---- assertions against fixtures/golden/expected.json ----
const G = J("fixtures/golden/expected.json");
const ev = (alt, pid) => alt.s.ev.find((l) => l.pid === pid);
const FIELD = { modeled_charge_cents: "charge", contractual_adjustment_cents: "adj", eligible_basis_cents: "elig", deductible_applied_cents: "ded",
  coverage_rate_bps: "rate", preliminary_plan_pay_cents: "prelim", cap_applied: "cap", plan_pay_cents: "plan", member_responsibility_cents: "member",
  service_date: "date", slot_id: "slot_id", provider_id: "provider_id", claim_route: "route" };
const STATE = { deductible_remaining_cents: "dedRem", deductible_available_cents: "dedAvail", annual_max_remaining_cents: "maxRem", pending_reserved_max_cents: "rMax", annual_max_available_cents: "maxAvail" };
const checkEvents = (alt, gEvents, tag) => {
  for (const ge of gEvents) {
    const l = ev(alt, ge.procedure_id);
    assert.ok(l, `${tag} ${ge.procedure_id} scheduled`);
    for (const [k, v] of Object.entries(ge)) {
      if (FIELD[k]) assert.equal(l[FIELD[k]], v, `${tag} ${ge.procedure_id}.${k}`);
      else if (k === "patient_charge_cents") assert.equal(l.plan + l.member, v, `${tag} ${ge.procedure_id}.${k}`);
      else if (k === "state_after") for (const [sk, sv] of Object.entries(v)) assert.equal(l.state[STATE[sk]], sv, `${tag} ${ge.procedure_id}.state_after.${sk}`);
      else if (k === "funding") assert.deepEqual(l.funding.map(([t, id, c]) => ({ source_type: t, source_id: id, payment_date: l.date, amount_cents: c })), v, `${tag} ${ge.procedure_id}.funding`);
    }
  }
};
const dates = (alt) => Object.fromEntries(alt.s.ev.map((l) => [l.pid, l.date]));
// previsit
for (const go of G.previsit.options) {
  const o = previsit.out.find((x) => x.provider_id === go.provider_id);
  assert.equal(o.slot_id, go.slot_id); assert.equal(o.plan, go.plan_pay.high_cents); assert.equal(o.you, go.member_cost.high_cents); assert.equal(o.charge, go.modeled_charge.high_cents);
  for (const gl of go.lines) { const l = o.lines.find((x) => x.code === gl.cdt_code); assert.equal(l.plan, gl.plan_pay_cents); assert.equal(l.member, gl.member_responsibility_cents); assert.equal(l.bb, gl.balance_bill_cents ?? 0); }
}
// base
const B = G.postvisit.base;
assert.equal(R.base.pass, B.pass, "base pass");
assert.equal(R.base.alts.length, B.alternatives.length, "base alternative count");
B.alternatives.forEach((ga, i) => {
  const a = R.base.alts[i];
  assert.deepEqual(a.labels, ga.labels, `base alt-${i + 1} labels`);
  assert.deepEqual(a.s.ev.map((l) => l.pid), ga.events.map((e) => e.procedure_id), `base alt-${i + 1} order`);
  checkEvents(a, ga.events, `base alt-${i + 1}`);
  assert.equal(a.s.obj.cost, ga.totals.member_cost_cents); assert.equal(a.s.gap, ga.funding_gap_cents);
  assert.equal(a.s.ev.reduce((t, l) => t + l.plan, 0), ga.totals.plan_pay_cents);
  assert.equal(a.s.ev.reduce((t, l) => t + l.charge, 0), ga.totals.modeled_charge_cents);
  assert.equal(a.s.ev.reduce((t, l) => t + l.adj, 0), ga.totals.contractual_adjustment_cents);
  assert.deepEqual(a.s.monthly.map((m) => ({ month: m.month, cash_cents: m.cash })), ga.monthly_cash);
  const O = { unscheduled_by_urgency: "unsched", lateness_days_by_urgency: "late", funding_shortfall_cents: "shortfall", total_member_cost_cents: "cost",
    peak_monthly_cash_cents: "peak", travel_minutes_total: "travel", visit_days: "visitDays", wait_days_total: "wait", expiring_funds_unused_cents: "unused", completion_date: "completion" };
  for (const [k, v] of Object.entries(ga.objective)) if (O[k]) assert.deepEqual(a.s.obj[O[k]], v, `base alt-${i + 1} objective.${k}`);
});
// variants
const V = G.postvisit.variants;
{ const r = R.budget_hard_limit_4000, g = V.budget_hard_limit_4000;
  assert.equal(r.pass, g.pass, "budget pass"); assert.deepEqual(dates(r.alts[0]), g.first_alternative.event_dates, "budget dates");
  assert.equal(r.alts[0].s.gap, g.first_alternative.funding_gap_cents, "budget gap"); assert.equal(r.alts[0].s.obj.cost, g.first_alternative.member_cost_cents); }
{ const r = R.no_tuesday_availability, g = V.no_tuesday_availability;
  assert.deepEqual(dates(r.alts[0]), g.first_alternative.event_dates); assert.deepEqual(Object.fromEntries(r.alts[0].s.ev.map((l) => [l.pid, l.slot_id])), g.first_alternative.slot_ids);
  assert.equal(r.alts[0].s.obj.cost, g.first_alternative.member_cost_cents); assert.deepEqual(r.alts[0].s.obj.late, g.first_alternative.lateness_days_by_urgency); }
{ const r = R.office_self_pay_unknown, g = V.office_self_pay_unknown;
  assert.equal(r.alts[0].s.obj.cost, g.first_alternative.member_cost_cents);
  const e = r.alts.find((a) => a.labels.includes("earliest_safe_completion"));
  assert.deepEqual(dates(e), g.earliest_safe_completion.event_dates); assert.equal(e.s.obj.cost, g.earliest_safe_completion.member_cost_cents);
  assert.equal(ev(e, "proc-fill-14").route, g.earliest_safe_completion.routes["proc-fill-14"]);
  for (const [pid, f] of Object.entries(g.earliest_safe_completion.lines)) { assert.equal(ev(e, pid).plan, f.plan_pay_cents); assert.equal(ev(e, pid).member, f.member_responsibility_cents); }
  for (const a of r.alts) for (const l of a.s.ev) assert.notEqual(l.route, g.no_event_uses_route); }
{ const r = R.no_pending_claims, g = V.no_pending_claims;
  assert.equal(r.alts[0].s.obj.cost, g.first_alternative.member_cost_cents);
  for (const [pid, f] of Object.entries(g.first_alternative.lines)) for (const [k, v] of Object.entries(f)) assert.equal(ev(r.alts[0], pid)[FIELD[k]], v, `no_pending ${pid}.${k}`); }
{ const r = R.filling_this_year_only, g = V.filling_this_year_only;
  for (const a of r.alts) for (const l of a.s.ev) assert.ok(l.date <= g.no_event_after);
  assert.deepEqual(r.alts[0].labels, g.first_alternative.labels); assert.deepEqual(dates(r.alts[0]), g.first_alternative.event_dates);
  assert.equal(ev(r.alts[0], "proc-fill-14").route, g.first_alternative.routes["proc-fill-14"]);
  assert.equal(r.alts[0].s.obj.cost, g.first_alternative.member_cost_cents); assert.equal(r.alts[0].s.obj.peak, g.first_alternative.peak_monthly_cash_cents);
  const e = r.alts.find((a) => a.labels.includes("earliest_safe_completion"));
  assert.deepEqual(dates(e), g.earliest_safe_completion.event_dates); assert.equal(e.s.obj.cost, g.earliest_safe_completion.member_cost_cents); assert.equal(e.s.obj.peak, g.earliest_safe_completion.peak_monthly_cash_cents); }
// (1.2) CONTRACT §5.9 route comparisons: flip one event's route, re-adjudicate the whole schedule (worst case), compare totals.
delete process.env.NO_MAX_2026;
const routeComparison = (r, alt, pid) => {
  const evs = alt.s.ev.map(({ pid, code, tooth, date, start, slot_id, provider_id, route }) => ({ pid, code, tooth, date, start, slot_id, provider_id, route }));
  const k = evs.findIndex((e) => e.pid === pid);
  const prov = r.inputs.pv.find((p) => p.provider_id === evs[k].provider_id);
  if (!prov.pricing.find((row) => row.cdt_code === evs[k].code)?.cash_quote) return null;
  const claimRoute = prov.network.tier === "in_network" ? "IN_NETWORK_CLAIM" : "OUT_OF_NETWORK_CLAIM";
  const flip = (route) => {
    const a = adjudicate(evs.map((e, j) => (j === k ? { ...e, route } : e)), r.inputs.m, r.inputs.pv, "worst", sc.postvisit_as_of.slice(0, 10));
    return a.blocked ? { total: null, missing: [a.blocked.split(" ")[0]] } : { total: a.lines.reduce((t, l) => t + l.member, 0), missing: [] };
  };
  const claim = flip(claimRoute), cash = flip("SELF_PAY_NO_CLAIM");
  const known = claim.total !== null && cash.total !== null;
  return {
    claim_route: claimRoute, claim_total_cents: claim.total, cash_total_cents: cash.total,
    difference_cents: known ? Math.abs(claim.total - cash.total) : null,
    winner_claim_route: known ? (cash.total < claim.total ? "SELF_PAY_NO_CLAIM" : claimRoute) : null,
    missing_codes: [...new Set([...claim.missing, ...cash.missing])].sort(),
  };
};
{ const RC = G.postvisit.route_comparisons;
  console.log("\n== ROUTE COMPARISONS (1.2)");
  for (const c of RC.cases) {
    const alt = R[c.variant].alts.find((a) => a.labels.includes(c.label));
    const l = ev(alt, c.procedure_id);
    const tag = `route_comparison ${c.variant}/${c.label}/${c.procedure_id}`;
    assert.equal(l.date, c.service_date, `${tag} date`); assert.equal(l.route, c.chosen_route, `${tag} chosen route`);
    const got = routeComparison(R[c.variant], alt, c.procedure_id);
    console.log(`  ${tag} ${l.date} ${l.route}: ${JSON.stringify(got)}`);
    const keys = ["claim_route", "claim_total_cents", "cash_total_cents", "difference_cents", "winner_claim_route", "missing_codes"];
    assert.deepEqual(got, Object.fromEntries(keys.map((k) => [k, c[k]])), tag);
  }
  for (const variant of new Set(RC.cases.map((c) => c.variant)))
    for (const alt of R[variant].alts) for (const pid of RC.null_for) assert.equal(routeComparison(R[variant], alt, pid), null, `route_comparison ${variant} ${pid} null`);
}
// (1.5) CONTRACT §5.10 rollover shift: move a can_plan_later 2026 claim that keeps 2026 from qualifying to the first
// 2027 candidate at the same provider and route (slot free, dependencies kept), re-adjudicate worst case.
const rolloverShift = (r, alt, pid) => {
  const evs = alt.s.ev.map(({ pid, code, tooth, date, start, slot_id, provider_id, route }) => ({ pid, code, tooth, date, start, slot_id, provider_id, route }));
  const k = evs.findIndex((e) => e.pid === pid);
  const l = alt.s.ev[k];
  const proc = r.order.find((p) => p.procedure_id === pid);
  const before = alt.s.rollover;
  if (proc.urgency !== "can_plan_later" || yearOf(l.date) !== 2026 || !l.counts || !(l.plan > 0)) return null;
  if (!before || !["NOT_EARNED", "UNCERTAIN"].includes(before.status)) return null;
  const used = new Set(evs.filter((_, j) => j !== k).map((e) => e.provider_id + "@" + e.slot_id));
  const ordered = [...r.cands[pid]].sort((a, b) => a.slot.date.localeCompare(b.slot.date) || a.slot.start_time.localeCompare(b.slot.start_time) ||
    a.provider_id.localeCompare(b.provider_id) || a.slot.slot_id.localeCompare(b.slot.slot_id) || a.route.localeCompare(b.route));
  const depsOk = (date) => r.order.every((p) => p.dependencies.every((d) => {
    const at = (id) => (id === pid ? date : evs.find((e) => e.pid === id)?.date);
    const me = at(p.procedure_id), pred = at(d.depends_on);
    if (!me) return true; if (!pred) return false;
    const g = diff(pred, me); return g >= d.min_gap_days && g <= d.max_gap_days;
  }));
  const c = ordered.find((c) => c.provider_id === l.provider_id && c.route === l.route && yearOf(c.slot.date) === 2027 && !used.has(c.provider_id + "@" + c.slot.slot_id) && depsOk(c.slot.date));
  if (!c) return null;
  const moved = evs.map((e, j) => (j === k ? { ...e, date: c.slot.date, start: c.slot.start_time, slot_id: c.slot.slot_id } : e))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.pid.localeCompare(b.pid));
  const a = adjudicate(moved, r.inputs.m, r.inputs.pv, "worst", sc.postvisit_as_of.slice(0, 10));
  if (a.blocked || !["CONDITIONAL", "EARNED", "UNCERTAIN"].includes(a.rollover.status) || a.rollover.status === before.status) return null;
  return {
    closing_plan_version_id: "nwd-ppo-standard-2026", moved_to_date: c.slot.date, moved_to_slot_id: c.slot.slot_id, plan_pay_in_closing_period_cents: l.plan,
    status_if_moved: a.rollover.status, final_bank_if_moved: a.rollover.final_bank,
    member_cost_delta_cents: a.lines.reduce((t, x) => t + x.member, 0) - alt.s.ev.reduce((t, x) => t + x.member, 0),
  };
};
{ console.log("\n== ROLLOVER (1.5)");
  const keys = ["closing_plan_version_id", "status", "threshold_cents", "settled_plan_paid_cents", "pending_plan_pay_cents", "qualifying_plan_paid", "final_bank", "lost_to_cap_cents", "forfeited_cents"];
  const pick = (o) => Object.fromEntries(keys.map((k) => [k, o[k]]));
  B.alternatives.forEach((ga, i) => {
    const a = R.base.alts[i];
    console.log(`  base alt-${i + 1} rollover: ${JSON.stringify(a.s.rollover)}`);
    assert.deepEqual([pick(a.s.rollover)], ga.rollover.map(pick), `base alt-${i + 1} rollover`);
    for (const pid of G.postvisit.rollover_shift_null_for) assert.equal(rolloverShift(R.base, a, pid), null, `base alt-${i + 1} ${pid} rollover_shift null`);
  });
  const g = V.rollover_near_threshold, r = R.rollover_near_threshold;
  assert.equal(r.alts.length, g.alternatives.length, "near-threshold alternative count");
  g.alternatives.forEach((ga, i) => {
    const a = r.alts[i];
    assert.deepEqual(a.labels, ga.labels, `near-threshold alt-${i + 1} labels`);
    checkEvents(a, ga.events, `near-threshold alt-${i + 1}`);
    assert.equal(a.s.obj.cost, ga.member_cost_cents, `near-threshold alt-${i + 1} cost`);
    assert.deepEqual([pick(a.s.rollover)], ga.rollover.map(pick), `near-threshold alt-${i + 1} rollover`);
    for (const ge of ga.events) {
      const got = rolloverShift(r, a, ge.procedure_id);
      console.log(`  near-threshold alt-${i + 1} ${ge.procedure_id} shift: ${JSON.stringify(got)}`);
      assert.deepEqual(got, ge.rollover_shift, `near-threshold alt-${i + 1} ${ge.procedure_id} rollover_shift`);
    }
  });
}
// AT-01: missing annual maximum → NEEDS_CONFIRMATION, no alternatives
assert.equal(R.missing_max.alts.length, 0, "missing annual_maximum.2026 → alternatives []");
console.log(`\nGOLDEN OK — every number in fixtures/golden/expected.json reproduced, route comparisons and rollover included (contract ${V10 ? "1.0.0" : CURRENT} rules)`);
