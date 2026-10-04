"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

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
  const signedIn = state.auth.status === "signedIn";

  function savePatient(details: PatientDetails) {
    controller.setProfile({
      id: state.profile?.id ?? "patient",
      ...details,
      accountEmail: state.auth.status === "signedIn" ? (state.auth.account.email ?? undefined) : undefined,
    });
    setPatient(details);
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
    const id = controller.createAnalysis(patient);
    controller.setMethod(id, method);
    router.push(`/analysis/${id}/intake?method=${method}`);
  }

  if (!patient) {
    return (
      <Page width="form">
        <NewAnalysisProgress step={1} />
        <PageHeader title="Who is this analysis for?" description="Start with a name. Everything else is optional." className="mb-6 md:mb-8" />
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
        <IdentityForm
          key={formSeed.key}
          initial={formSeed.initial}
          submitLabel={signedIn ? "Continue" : "Continue as guest"}
          onSubmit={savePatient}
          compact
          secondary={
            !signedIn && (
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/sign-in?callbackUrl=/analysis/new">Continue with Google</Link>
              </Button>
            )
          }
        />
        <p className="mt-4 text-sm text-muted-foreground">{demo ? "Use fictional details only. " : ""}{!signedIn && "You can continue without an account. Guest work lasts for this session."}</p>
      </Page>
    );
  }

  return (
    <Page width="form">
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
            const id = controller.startSampleAnalysis(patient);
            router.push(`/analysis/${id}/confirm`);
          }}
        >
          Use sample treatment
        </Button>
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
