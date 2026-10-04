"use client";

import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { Notice } from "@/components/shared/feedback";
import { Page, PageHeader } from "@/components/shared/page";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import { IdentityForm } from "@/features/intake/identity-form";
import { newId } from "@/lib/adapters/shared";
import { cn } from "@/lib/utils";
import type { PatientDetails, PatientProfile } from "@/lib/domain/types";
import { AccountSection } from "./account-section";
import { DataControls } from "./data-controls";
import { DemoControls } from "./demo-controls";

interface SectionLink {
  id: string;
  title: string;
  description: string;
}

/** The section whose heading most recently crossed the upper part of the viewport. */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join("|");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id.replace(/-section$/, ""));
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    for (const id of key.split("|")) {
      const element = document.getElementById(`${id}-section`);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [key]);
  return active;
}

export function ProfileScreen() {
  const { adapters, state } = useAnalysisController();
  const { profile, auth } = state;
  const sections: SectionLink[] = [
    { id: "patient", title: "Patient details", description: "One active patient. These details prefill new analyses." },
    { id: "account", title: "Account", description: "Signing in is optional. It only adds saving across visits." },
    { id: "data", title: "Data controls", description: "Clear work in progress or remove saved analyses." },
    ...(adapters.mode === "demo"
      ? [{ id: "demo", title: "Demo data", description: "Make the simulated services succeed or fail on purpose. This lasts only for this browser session." }]
      : []),
  ];
  const active = useActiveSection(sections.map((section) => section.id));
  const bodies: Record<string, ReactNode> = {
    patient: <PatientDetailsSection />,
    account: <AccountSection />,
    data: <DataControls />,
    demo: <DemoControls />,
  };
  const name = profile?.displayName ?? "Guest";
  const accountLine = auth.status === "signedIn" ? (auth.account.email ?? "Signed in") : "Not signed in";

  return (
    <Page>
      <PageHeader title="Profile" description="Who the analysis is for, your account and the data this browser holds." />

      <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        <aside aria-label="Profile summary" className="lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
          <Stagger gap={0.1} className="space-y-6">
            <StaggerItem className="flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(35,31,32,0.04),0_8px_24px_-12px_rgba(101,0,48,0.12)]">
              <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent font-display text-2xl font-semibold text-primary">
                {name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="font-display text-xl font-semibold break-words">{name}</p>
                <p className="text-sm break-all text-muted-foreground">{accountLine}</p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <nav aria-label="Profile sections" className="hidden lg:block">
                <ul className="space-y-1">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}-section`}
                        aria-current={active === section.id ? "true" : undefined}
                        className={cn("relative flex min-h-11 items-center rounded-lg px-4 text-[15px] font-medium transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", active === section.id ? "text-primary" : "text-muted-foreground")}
                      >
                        {active === section.id && (
                          <motion.span layoutId="profile-nav-pill" transition={{ type: "spring", stiffness: 420, damping: 36 }} className="absolute inset-0 rounded-lg border-l-4 border-l-brand bg-accent" />
                        )}
                        <span className="relative">{section.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </StaggerItem>
          </Stagger>
        </aside>

        <div className="min-w-0 space-y-6 lg:col-span-8">
          <Reveal delay={0.05}>
            <Notice title="Synthetic demo">CareWindow works with synthetic data only. Don&apos;t enter real health or insurance details.</Notice>
          </Reveal>
          {sections.map((section, index) => (
            <Reveal key={section.id} delay={index === 0 ? 0.15 : 0}>
              <ProfileSection {...section}>{bodies[section.id]}</ProfileSection>
            </Reveal>
          ))}
        </div>
      </div>
    </Page>
  );
}

function ProfileSection({ id, title, description, children }: SectionLink & { children: ReactNode }) {
  const headingId = `${id}-heading`;
  return (
    <section id={`${id}-section`} aria-labelledby={headingId} className="scroll-mt-28 rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(35,31,32,0.04)] md:p-8">
      <h2 id={headingId} className="font-display text-xl font-semibold tracking-tight md:text-section">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
