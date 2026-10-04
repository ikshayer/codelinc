"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Notice } from "@/components/shared/feedback";
import { Page, PageHeader, SectionHeading } from "@/components/shared/page";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import { IdentityForm } from "@/features/intake/identity-form";
import { newId } from "@/lib/adapters/shared";
import type { PatientDetails, PatientProfile } from "@/lib/domain/types";
import { AccountSection } from "./account-section";
import { DataControls } from "./data-controls";
import { DemoControls } from "./demo-controls";

export function ProfileScreen() {
  const { adapters } = useAnalysisController();

  return (
    <Page width="form">
      <PageHeader title="Profile" description="Who the analysis is for, your account and the data this browser holds." />

      <div className="space-y-6 pb-12">
        <Notice title="Synthetic demo">CareWindow works with synthetic data only. Don&apos;t enter real health or insurance details.</Notice>
      </div>

      <div className="space-y-16">
        <ProfileSection id="patient" title="Patient details" description="One active patient. These details prefill new analyses.">
          <PatientDetailsSection />
        </ProfileSection>

        <ProfileSection id="account" title="Account" description="Signing in is optional. It only adds saving across visits.">
          <AccountSection />
        </ProfileSection>

        <ProfileSection id="data" title="Data controls" description="Clear work in progress or remove saved analyses.">
          <DataControls />
        </ProfileSection>

        {adapters.mode === "demo" && (
          <ProfileSection id="demo" title="Demo data" description="Make the simulated services succeed or fail on purpose. This lasts only for this browser session.">
            <DemoControls />
          </ProfileSection>
        )}
      </div>
    </Page>
  );
}

function ProfileSection({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  const headingId = `${id}-heading`;
  return (
    <section aria-labelledby={headingId}>
      <SectionHeading id={headingId} description={description}>
        {title}
      </SectionHeading>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function PatientDetailsSection() {
  const { state, setProfile } = useAnalysisController();
  const [savedNotice, setSavedNotice] = useState(false);
  const { profile, auth } = state;
  // Remount the form when the stored profile changes (save, demo reset) so it shows what's saved.
  const formKey = profile ? [profile.id, profile.displayName, profile.fullName, profile.dateOfBirth, profile.contactEmail].join("|") : "no-profile";

  function save(details: PatientDetails) {
    const next: PatientProfile = {
      ...details,
      id: profile?.id ?? newId("patient"),
      accountEmail: auth.status === "signedIn" ? (auth.account.email ?? undefined) : undefined,
    };
    setProfile(next);
    setSavedNotice(true);
    toast.success("Patient details saved");
  }

  return (
    <div className="space-y-6">
      <IdentityForm key={formKey} initial={profile} submitLabel="Save details" onSubmit={save} />
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {savedNotice ? "Details saved. " : ""}Changing your details doesn&apos;t change saved analyses.
      </p>
    </div>
  );
}
