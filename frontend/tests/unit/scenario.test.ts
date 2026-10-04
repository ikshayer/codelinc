import { describe, expect, it } from "vitest";
import { SAMPLE_TREATMENT_VALUES } from "@/fixtures/sample-treatment";
import { applyProposals, editFact, emptyDraft } from "@/lib/domain/draft";
import { carePaths, planPaths, timingPaths } from "@/lib/domain/fields";
import { buildConfirmedScenario, draftValuesFromScenario } from "@/lib/domain/scenario";
import { buildOk, evidence, proposal, proposedSampleDraft, typedSampleDraft } from "./helpers";

function issuesFor(draft: ReturnType<typeof typedSampleDraft>) {
  const built = buildConfirmedScenario(draft);
  if (built.ok) throw new Error("expected build failure");
  return built.issues;
}

describe("buildConfirmedScenario with the sample values", () => {
  const scenario = buildOk(typedSampleDraft());

  it("maps plan years", () => {
    const [y1, y2] = scenario.plan.years;
    expect(y1.annualMaximumCents).toBe(150000);
    expect(y1.utilization.priorInsurerPaymentsCents).toBe(110000);
    expect(y1.deductibleCents).toBe(5000);
    expect(y1.utilization.priorDeductibleSatisfiedCents).toBe(5000);
    expect(y2.utilization.priorInsurerPaymentsCents).toBe(0);
    expect(y2.utilization.priorDeductibleSatisfiedCents).toBe(0);
  });

  it("maps coverage rules to basis points", () => {
    const rules = scenario.plan.years[0].rules;
    expect(rules.preventive.insurerBasisPoints).toBe(10000);
    expect(rules.basic.insurerBasisPoints).toBe(8000);
    expect(rules.major.insurerBasisPoints).toBe(5000);
  });

  it("maps the four procedures with their fees", () => {
    expect(scenario.procedures.map((p) => [p.id, p.contractedFeeCents])).toEqual([
      ["p1", 15000],
      ["p2", 20000],
      ["p3", 20000],
      ["p4", 150000],
    ]);
  });

  it("maps the crown dependencies, windows and deadline", () => {
    expect(scenario.dependencies.map((d) => [d.beforeProcedureId, d.afterProcedureId, d.minGapDays])).toEqual([
      ["p2", "p4", 1],
      ["p3", "p4", 1],
    ]);
    const crown = scenario.procedures.find((p) => p.id === "p4")!;
    expect(crown.windows.map((w) => w.benefitYearId)).toEqual(["y1", "y2"]);
    expect(crown.deadline).toBe("2027-01-31");
  });

  it("stamps facts with the draft revision", () => {
    expect(scenario.facts.every((f) => f.confirmedAtRevision === scenario.revision)).toBe(true);
  });
});

describe("buildConfirmedScenario blocking rules", () => {
  it("a blank already-used amount blocks as MISSING; unknown is not zero", () => {
    const path = planPaths.alreadyUsed("y1");
    const issues = issuesFor(typedSampleDraft({ [path]: "" }));
    expect(issues).toContainEqual(expect.objectContaining({ fieldPath: path, code: "MISSING", severity: "blocking" }));
  });

  it("an unset already-used amount also blocks", () => {
    const draft = typedSampleDraft();
    const { [planPaths.alreadyUsed("y1")]: removed, ...facts } = draft.facts;
    void removed;
    const built = buildConfirmedScenario({ ...draft, facts });
    expect(built.ok).toBe(false);
  });

  it("an explicit zero already-used amount is valid", () => {
    const scenario = buildOk(typedSampleDraft({ [planPaths.alreadyUsed("y1")]: "0" }));
    expect(scenario.plan.years[0].utilization.priorInsurerPaymentsCents).toBe(0);
  });

  it("a conflict blocks with CONFLICT on that path", () => {
    const path = planPaths.annualMaximum("y1");
    const ev = evidence("x1", "other-report");
    const draft = applyProposals(typedSampleDraft(), [proposal(path, "2,000", "x1")], [ev]);
    expect(issuesFor(draft)).toContainEqual(expect.objectContaining({ fieldPath: path, code: "CONFLICT" }));
  });

  it("unknown crown permission fixes the crown to its anchor: no windows", () => {
    const scenario = buildOk(typedSampleDraft({ [timingPaths.permission("p4")]: "unknown" }));
    const crown = scenario.procedures.find((p) => p.id === "p4")!;
    expect(crown.timingPermission).toBe("unknown");
    expect(crown.windows).toEqual([]);
  });

  it("a missing permission answer blocks", () => {
    const issues = issuesFor(typedSampleDraft({ [timingPaths.permission("p4")]: null }));
    expect(issues).toContainEqual(expect.objectContaining({ fieldPath: timingPaths.permission("p4"), code: "MISSING" }));
  });

  it("an anchor after the dentist deadline blocks", () => {
    const issues = issuesFor(typedSampleDraft({ [timingPaths.deadline("p4")]: "2026-11-01" }));
    expect(issues).toContainEqual(expect.objectContaining({ fieldPath: timingPaths.deadline("p4"), code: "ANCHOR_AFTER_DEADLINE" }));
  });

  it("eligibilityConfirmed false blocks", () => {
    const issues = issuesFor(typedSampleDraft({ [carePaths.eligibilityConfirmed("p2")]: false }));
    expect(issues).toContainEqual(expect.objectContaining({ fieldPath: carePaths.eligibilityConfirmed("p2"), code: "NOT_ELIGIBLE" }));
  });

  it("an empty draft has blocking issues and no scenario", () => {
    expect(buildConfirmedScenario(emptyDraft()).ok).toBe(false);
  });

  it("extra events from overflow block", () => {
    const draft = applyProposals(typedSampleDraft(), [], [], [{ label: "Fifth procedure", evidenceId: null }]);
    expect(issuesFor(draft)).toContainEqual(expect.objectContaining({ code: "EXTRA_EVENTS" }));
  });

  it("a next-year rules assumption of false blocks", () => {
    const issues = issuesFor(typedSampleDraft({ [planPaths.rulesUnchanged]: false }));
    expect(issues).toContainEqual(expect.objectContaining({ code: "UNSUPPORTED_NEXT_YEAR_RULES" }));
  });
});

describe("fact provenance", () => {
  const timingFacts = (kind: "pdf" | "voice") => buildOk(proposedSampleDraftFor(kind)).facts.filter((f) => f.fieldPath.startsWith("timing."));

  // Same values as the sample, but arriving from a non-sample source.
  function proposedSampleDraftFor(kind: "pdf" | "voice") {
    const ev = evidence(`${kind}-ev`, `${kind}-src`, kind);
    return applyProposals(
      emptyDraft(),
      Object.entries(SAMPLE_TREATMENT_VALUES).map(([path, value]) => proposal(path, value, ev.id)),
      [ev],
    );
  }

  it.each(["pdf", "voice"] as const)("timing facts from %s evidence are userReportedDentist, never aiProposal", (kind) => {
    const facts = timingFacts(kind);
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.source.kind === "userReportedDentist")).toBe(true);
  });

  it("non-timing facts from pdf evidence are aiProposal", () => {
    const fee = buildOk(proposedSampleDraftFor("pdf")).facts.find((f) => f.fieldPath === carePaths.fee("p1"))!;
    expect(fee.source.kind).toBe("aiProposal");
  });

  it("typed values are userEntry, and typed timing is still userReportedDentist", () => {
    const facts = buildOk(typedSampleDraft()).facts;
    expect(facts.find((f) => f.fieldPath === carePaths.fee("p1"))!.source.kind).toBe("userEntry");
    expect(facts.find((f) => f.fieldPath === timingPaths.deadline("p4"))!.source.kind).toBe("userReportedDentist");
  });

  it("sample evidence maps to syntheticFixture", () => {
    const facts = buildOk(proposedSampleDraft("sample")).facts;
    expect(facts.every((f) => f.source.kind === "syntheticFixture")).toBe(true);
  });

  it("dependency and window sources are userReportedDentist for pdf evidence", () => {
    const scenario = buildOk(proposedSampleDraftFor("pdf"));
    expect(scenario.dependencies.every((d) => d.source.kind === "userReportedDentist")).toBe(true);
    const crown = scenario.procedures.find((p) => p.id === "p4")!;
    expect(crown.windows.every((w) => w.source.kind === "userReportedDentist")).toBe(true);
  });
});

describe("draftValuesFromScenario", () => {
  it("round-trips the sample scenario back to the sample draft values", () => {
    const scenario = buildOk(typedSampleDraft());
    const values = draftValuesFromScenario(scenario);
    for (const [path, value] of Object.entries(SAMPLE_TREATMENT_VALUES)) expect(values[path], path).toEqual(value);
  });

  it("rebuilding from the round-tripped values yields the same money-relevant scenario", () => {
    const original = buildOk(typedSampleDraft());
    let draft = emptyDraft();
    for (const [path, value] of Object.entries(draftValuesFromScenario(original))) draft = editFact(draft, path, value);
    const rebuilt = buildOk(draft);
    const core = (s: typeof original) => ({
      years: s.plan.years,
      procedures: s.procedures.map((p) => ({ ...p, windows: p.windows.map(({ source, ...w }) => (void source, w)) })),
      dependencies: s.dependencies.map(({ source, ...d }) => (void source, d)),
    });
    expect(core(rebuilt)).toEqual(core(original));
  });
});
