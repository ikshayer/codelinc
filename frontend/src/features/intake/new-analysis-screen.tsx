"use client";

import { CheckIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { BrandBackdrop } from "@/components/brand/brand-backdrop";
import { LincolnAbe } from "@/components/brand/lincoln-logo";
import { EASE_OUT, Stagger, StaggerItem } from "@/components/motion/reveal";
import { Page, PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import type { IntakeMethod } from "@/features/analysis/state";
import { SAMPLE_PROFILE } from "@/fixtures/sample-treatment";
import { formatIsoDate } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";
import type { PatientDetails } from "@/lib/domain/types";
import { IdentityForm } from "./identity-form";
import { IntakeMethodPicker } from "./intake-method-picker";
import { lookupMember, type MemberData } from "@/lib/adapters/live/member-data";
import { useEngineCall } from "@/features/care-window/parts";
import { ErrorPanel } from "@/components/shared/feedback";
import { Spinner } from "@/components/ui/spinner";
import { MemberBenefitSummary } from "./member-benefit-summary";

function parseMethod(value: string | null): IntakeMethod | null {
  return value === "pdf" || value === "voice" || value === "manual" ? value : null;
}

/** /analysis/new — a short introduction, then one choice of intake method. */
export function NewAnalysisScreen() {
  const controller = useAnalysisController();
  const { state, adapters } = controller;
  const router = useRouter();
  const searchParams = useSearchParams();
  const demo = adapters.mode === "demo";

  const [patient, setPatient] = useState<PatientDetails | null>(null);
  const [formSeed, setFormSeed] = useState<{ key: string; initial: PatientDetails | null }>({ key: "profile", initial: state.profile });
  const [method, setMethod] = useState<IntakeMethod | null>(parseMethod(searchParams.get("method")));
  const [methodError, setMethodError] = useState(false);
  const [matchedMember, setMatchedMember] = useState<MemberData | null>(null);
  const [lookup, runLookup] = useEngineCall<MemberData>();
  const signedIn = state.auth.status === "signedIn";

  async function savePatient(details: PatientDetails) {
    setMatchedMember(null);
    if (!details.dateOfBirth) return;
    const member = await runLookup((signal) => lookupMember({ memberId: details.memberId!, dateOfBirth: details.dateOfBirth! }, signal));
    if (!member) return;
    setMatchedMember(member);
    const accepted = { ...details, memberId: member.member.member_id, displayName: member.member.display_name, fullName: member.member.display_name };
    controller.setProfile({
      id: state.profile?.id ?? "patient",
      ...accepted,
      accountEmail: state.auth.status === "signedIn" ? (state.auth.account.email ?? undefined) : undefined,
    });
    setFormSeed({ key: "accepted", initial: accepted });
    setPatient(accepted);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      document.getElementById("new-analysis-progress")?.focus({ preventScroll: true });
    });
  }

  function start() {
    if (!patient) return;
    if (!method) {
      setMethodError(true);
      document.getElementById(`method-pdf`)?.focus();
      return;
    }
    const id = controller.createAnalysis(patient, undefined, matchedMember ?? undefined);
    controller.setMethod(id, method);
    router.push(`/analysis/${id}/intake?method=${method}`);
  }

  if (!patient) {
    return (
      <SetupLayout step={1}>
        <NewAnalysisProgress step={1} />
        <PageHeader title="Who is this analysis for?" description="Enter the member ID and date of birth to load their synthetic benefit record." className="mb-6 md:mb-8" />
        {demo && (
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <Button variant="link" className="px-0" onClick={() => setFormSeed({ key: `demo-${Date.now()}`, initial: SAMPLE_PROFILE })}>
              Use demo profile
            </Button>
            <Button variant="link" className="px-0" onClick={() => setFormSeed({ key: `blank-${Date.now()}`, initial: null })}>
              Start with a blank form
            </Button>
          </div>
        )}
        <div id="member-lookup-form"><IdentityForm
          key={formSeed.key}
          initial={formSeed.initial}
          submitLabel="Continue"
          onSubmit={savePatient}
          compact
          busy={lookup.status === "loading"}
        /></div>
        {lookup.status === "loading" && <p role="status" className="mt-4 flex items-center gap-2 text-sm"><Spinner />Looking up this synthetic member’s benefits…</p>}
        {lookup.status === "error" && <div className="mt-4"><ErrorPanel title="Member lookup did not match or could not finish" error={lookup.error} onRetry={() => document.getElementById("member-lookup-form")?.querySelector("form")?.requestSubmit()} /></div>}
        <p className="mt-4 text-sm text-muted-foreground">{demo ? "Use fictional details only. " : ""}{!signedIn && "You can continue without an account. Guest work lasts for this session."}</p>
      </SetupLayout>
    );
  }

  return (
    <SetupLayout step={2}>
      <NewAnalysisProgress step={2} />
      <PageHeader title="How would you like to start?" description="Choose one way to begin. You can add the others later." className="mb-6 md:mb-8" />
      <div className="mb-6 flex items-start justify-between gap-3 rounded-lg bg-muted px-4 py-3">
        <p className="min-w-0 break-words text-sm">
          <span className="text-muted-foreground">For </span>
          <span className="font-medium">{patient.displayName}</span>
          {patient.dateOfBirth && <span className="text-muted-foreground">, born {formatIsoDate(patient.dateOfBirth)}</span>}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setPatient(null)}>
          Edit details
        </Button>
      </div>
      {matchedMember && <div className="mb-6"><MemberBenefitSummary data={matchedMember} /></div>}
      <h2 id="method-heading" tabIndex={-1} className="mb-3 text-lg font-semibold outline-none">
        Choose how to describe your treatment
      </h2>
      <IntakeMethodPicker
        value={method}
        onChange={(next) => {
          setMethod(next);
          setMethodError(false);
        }}
        labelledBy="method-heading"
      />
      {methodError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Choose one way to start.
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button size="lg" onClick={start} className="w-full sm:w-auto">
          {method === "pdf" ? "Continue with PDF" : method === "voice" ? "Continue with voice" : method === "manual" ? "Continue manually" : "Continue"}
        </Button>
        <Button
          variant="link"
          className="px-0"
          onClick={() => {
            const id = matchedMember ? controller.createAnalysis(patient, "Sample treatment", matchedMember) : controller.startSampleAnalysis(patient);
            if (matchedMember) { controller.setMethod(id, "manual"); controller.loadSample(id); }
            router.push(`/analysis/${id}/confirm`);
          }}
        >
          Use sample treatment
        </Button>
      </div>
    </SetupLayout>
  );
}

const PROMISES = [
  ["Start with member ID and date of birth", "Both must match the synthetic member record to load the correct benefits."],
  ["You review every fact", "Reports and conversations only propose values. Nothing counts until you confirm it."],
  ["Your dentist sets the dates", "We only compare timing your dentist has already approved."],
] as const;

/** Asymmetric setup frame: the task on the left, a living brand panel with what happens next on the right. */
function SetupLayout({ step, children }: { step: 1 | 2; children: React.ReactNode }) {
  return (
    <Page>
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: step === 2 ? 32 : -32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: step === 2 ? -32 : 32 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="min-w-0 lg:col-span-7"
          >
            {children}
          </motion.div>
        </AnimatePresence>
        <aside aria-label="What happens next" className="relative mt-8 text-white lg:sticky lg:top-24 lg:col-span-5 lg:mt-16 lg:self-start">
          {/* clip-path (not just overflow-hidden) so the WebGL canvas respects the rounded corners in every browser. */}
          <div aria-hidden className="absolute inset-0 overflow-hidden rounded-3xl shadow-[0_32px_64px_-32px_rgba(101,0,48,0.65)] [clip-path:inset(0_round_1.5rem)]">
            <BrandBackdrop variant="hero" />
            <div className="absolute inset-0 bg-gradient-to-br from-primary/70 via-primary/45 to-primary/20" />
            <div className="absolute inset-0 rounded-3xl ring-1 ring-white/15 ring-inset" />
          </div>
          {/* Abe breaks out over the top edge as the panel's badge. */}
          <motion.div
            initial={{ scale: 0.6, rotate: -12, opacity: 0, y: 8 }}
            animate={{ scale: 1, rotate: 0, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.15 }}
            className="absolute -top-9 right-7 rounded-full bg-card p-1.5 shadow-lg shadow-primary/25 ring-4 ring-background"
          >
            <LincolnAbe className="h-14" />
          </motion.div>
          <div className="relative px-6 pt-8 pb-6 md:px-8 md:pt-10 md:pb-7">
            <p className="font-display text-2xl leading-8 font-semibold">What happens next</p>
            <Stagger className="mt-6 space-y-5" delay={0.2} gap={0.1}>
              {PROMISES.map(([title, detail]) => (
                <StaggerItem key={title} className="flex gap-3">
                  <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
                    <CheckIcon className="size-3.5" />
                  </span>
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="mt-1 block text-sm text-white/80">{detail}</span>
                  </span>
                </StaggerItem>
              ))}
            </Stagger>
            <p className="mt-7 border-t border-white/20 pt-4 text-sm text-white/75">Synthetic data only. Live services receive the details needed to process your request.</p>
          </div>
        </aside>
      </div>
    </Page>
  );
}

function NewAnalysisProgress({ step }: { step: 1 | 2 }) {
  return (
    <ol id="new-analysis-progress" tabIndex={-1} aria-label="New analysis setup" className="mb-6 flex items-center gap-3 text-sm outline-none">
      {["Your details", "Choose input"].map((label, index) => (
        <li key={label} aria-current={index + 1 === step ? "step" : undefined} className="flex items-center gap-2">
          {index > 0 && <span aria-hidden className="mr-1 h-px w-6 bg-border" />}
          <span aria-hidden className={cn("flex size-6 items-center justify-center rounded-full text-xs font-medium", index + 1 <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{index + 1}</span>
          <span className={cn(index + 1 === step ? "font-medium" : "text-muted-foreground")}>{label}</span>
        </li>
      ))}
    </ol>
  );
}
