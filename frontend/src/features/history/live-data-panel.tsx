"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import type { MemberData } from "@/lib/adapters/live/member-data";

type MemberSummary = { member_id: string; display_name: string; plan_version_id: string };
const currency = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function LiveDataPanel() {
  const router = useRouter();
  const { createFromMember } = useAnalysisController();
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [data, setData] = useState<MemberData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/demo/members", { cache: "no-store", signal: controller.signal })
      .then(async (r) => { if (!r.ok) throw new Error("Could not load members. Check that the backend is running and MongoDB is reachable."); return r.json() as Promise<{ members: MemberSummary[] }>; })
      .then((payload) => { setMembers(payload.members); setLoading(false); })
      .catch((e: unknown) => { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : "Could not load members."); setLoading(false); } });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetch(`/api/demo/members/${encodeURIComponent(selected)}`, { cache: "no-store", signal: controller.signal })
      .then(async (r) => { if (!r.ok) throw new Error("Could not load this member's records."); return r.json() as Promise<MemberData>; })
      .then((payload) => { setData(payload); setLoading(false); })
      .catch((e: unknown) => { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : "Could not load member."); setLoading(false); } });
    return () => controller.abort();
  }, [selected, attempt]);

  return <Card className="mb-8 border-primary/15">
    <CardHeader><CardTitle>Member records</CardTitle><p className="text-sm text-muted-foreground">Choose a member to review their stored benefits, claims and treatment plan. These database records are synthetic.</p></CardHeader>
    <CardContent className="space-y-5">
      <label className="block space-y-2"><span className="text-sm font-medium">Member</span><select className="w-full rounded-md border bg-background p-3" value={selected} onChange={(event) => { setSelected(event.target.value); setData(null); setError(null); setLoading(Boolean(event.target.value)); }}>
        <option value="">Select a member</option>{members.map((member) => <option key={member.member_id} value={member.member_id}>{member.display_name} — {member.member_id}</option>)}
      </select></label>
      {loading && <p role="status">Loading records…</p>}
      {error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => { setError(null); setLoading(true); setAttempt((n) => n + 1); }}>Retry</Button></div>}
      {data && <>
        <div className="grid gap-3 sm:grid-cols-2">
          <p><strong>{data.member.display_name}</strong><br />{data.plan.display_name}</p>
          <p>Benefits observed: {data.member.observed_at.slice(0, 10)}</p>
          <p>Annual maximum remaining: {currency(data.member.benefit_state.annual_maximum_remaining_cents)}</p>
          <p>In-network deductible remaining: {currency(data.member.benefit_state.deductible_remaining_cents.in_network)}</p>
          <p>Pending claims: {data.member.benefit_state.pending_claims.length}</p>
          <p>Rollover balance: {currency(data.member.benefit_state.rollover_bank_cents ?? 0)}</p>
        </div>
        <section><h3 className="font-medium">Treatment on file</h3>{data.procedure_card ? <ul className="mt-2 space-y-2">{data.procedure_card.procedures.map((p) => <li key={p.procedure_id}>{p.label} ({p.cdt}) · Dentist estimate {currency(p.dentist_estimated_fee_cents)}<br /><span className="text-sm text-muted-foreground">{p.earliest_safe_date} to {p.latest_safe_date} · {p.confirmation_status}</span></li>)}</ul> : <p>No treatment card is stored for this member. You can enter procedures in the review form.</p>}</section>
        <section><h3 className="font-medium">Claims on file</h3>{data.claims.length ? <ul className="mt-2 space-y-1">{data.claims.map((c) => <li key={c.claim_id}>{c.service_date} · {c.cdt} · {c.status} · Plan paid {currency(c.plan_payment_cents)}</li>)}</ul> : <p>No claims on file.</p>}</section>
        <p className="text-sm text-muted-foreground">Imported facts require review. Confirm contracted fees and coverage before comparing. The calculation service is still incomplete.</p>
        <Button onClick={() => { try { router.push(`/analysis/${createFromMember(data)}/confirm`); } catch (e) { setError(e instanceof Error ? e.message : "Could not import member records."); } }}>Review this member&apos;s treatment plan</Button>
      </>}
    </CardContent>
  </Card>;
}
