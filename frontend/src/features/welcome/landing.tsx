"use client";

import { MotionConfig } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import BlurText from "@/components/BlurText";
import { Button } from "@/components/ui/button";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import { analysisStatus } from "@/features/analysis/state";
import { fixtureComparison } from "@/fixtures/calculation-fixtures";
import { formatCents } from "@/lib/domain/money";

const STEPS = ["Tell us who it's for", "Review the facts", "Compare dentist-approved options"];

// Sample preview reads its numbers straight from the canonical fixture records.
const preview = fixtureComparison("canonical", 0);

export function Landing() {
  const controller = useAnalysisController();
  const router = useRouter();
  const returning = Object.values(controller.state.analyses).some((a) => analysisStatus(a) !== "draft");

  function useSample() {
    const id = controller.startSampleAnalysis(controller.state.profile);
    router.push(`/analysis/${id}/confirm`);
  }

  return (
    <div className="mx-auto max-w-[1120px] px-5 md:px-8">
      <section className="grid gap-12 pt-14 pb-16 md:pt-24 md:pb-24 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
        <div>
          <MotionConfig reducedMotion="user">
            <h1 className="text-display-sm font-semibold tracking-tight md:text-display">
              <BlurText
                as="span"
                text="Understand your dental costs before you book."
                animateBy="words"
                delay={60}
                stepDuration={0.18}
                animationFrom={{ filter: "blur(8px)", opacity: 0, y: 12 }}
                animationTo={[{ filter: "blur(0px)", opacity: 1, y: 0 }]}
              />
            </h1>
          </MotionConfig>
          <p className="mt-6 max-w-[34rem] text-lg text-pretty text-muted-foreground">
            Start with your dentist&apos;s report, a short conversation or the details you know. See what you&apos;d pay, and whether dates your dentist already approved
            change it.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button asChild size="lg">
              <Link href="/analysis/new">Start an analysis</Link>
            </Button>
            <Button variant="link" className="px-0 text-base" onClick={useSample}>
              Use sample
            </Button>
          </div>
          {returning && (
            <p className="mt-6 text-sm text-muted-foreground">
              Picking up where you left off?{" "}
              <Link href="/dashboard" className="text-primary underline-offset-4 hover:underline">
                Go to your analyses
              </Link>
            </p>
          )}
          <ol className="mt-12 flex flex-col gap-3 border-t pt-6 text-sm text-muted-foreground sm:flex-row sm:gap-8">
            {STEPS.map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-full border text-xs font-medium text-foreground tabular">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        <ProductPreview />
      </section>

      <section className="grid gap-8 border-t py-14 md:grid-cols-[1fr_2fr] md:py-20">
        <h2 className="text-section font-semibold tracking-tight">Optimize the benefits. Never the care.</h2>
        <dl className="grid gap-6 sm:grid-cols-2">
          {[
            ["AI interprets", "An identified intake assistant gathers facts from your report or conversation. It never acts as your dentist."],
            ["Code calculates", "Every estimate comes from a traceable calculation record you can open, step by step."],
            ["Your dentist constrains", "Only dates your dentist approved are compared. If timing is unknown, care stays on its planned date."],
            ["You decide", "Nothing is compared until you confirm the facts, and payment is never guaranteed."],
          ].map(([term, detail]) => (
            <div key={term}>
              <dt className="font-semibold">{term}</dt>
              <dd className="mt-1 text-muted-foreground">{detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="border-t py-8 text-sm text-muted-foreground">Synthetic demo data only. CareWindow is not medical, dental or insurance advice.</footer>
    </div>
  );
}

function ProductPreview() {
  const later = preview.cheaperAlternative!;
  return (
    <figure aria-label="Sample comparison preview" className="rounded-lg border bg-card p-6 md:p-8">
      <figcaption className="mb-6 flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>Sample comparison</span>
        <span className="rounded-md border px-2 py-0.5 text-xs">Synthetic data</span>
      </figcaption>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-sm text-muted-foreground">All care this year</p>
          <p className="tabular mt-1 text-[2rem] leading-10 font-semibold tracking-tight md:text-money">{formatCents(preview.baseline.totalPatientCents)}</p>
          <p className="text-sm text-muted-foreground">you pay</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Crown in January</p>
          <p className="tabular mt-1 text-[2rem] leading-10 font-semibold tracking-tight text-primary md:text-money">{formatCents(later.totalPatientCents)}</p>
          <p className="text-sm text-muted-foreground">you pay</p>
        </div>
      </div>
      <div className="mt-8" aria-hidden>
        <div className="relative h-14">
          <div className="absolute inset-x-0 top-6 h-px bg-border" />
          <div className="absolute top-3 left-1/2 h-7 w-px bg-foreground/40" />
          <span className="absolute top-9 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">New benefit year</span>
          {[12, 16, 20].map((left) => (
            <span key={left} className="absolute top-[1.3rem] size-2.5 rounded-full bg-muted-foreground/60" style={{ left: `${left}%` }} />
          ))}
          <span className="absolute top-[1.3rem] left-[38%] size-2.5 rounded-full border border-dashed border-muted-foreground bg-background" />
          <span className="absolute top-[1.05rem] left-[60%] size-3.5 rounded-full bg-primary" />
          <span className="absolute -top-1 left-[56%] text-xs font-medium text-primary">Crown</span>
        </div>
      </div>
      <p className="mt-4 border-t pt-4 text-sm">
        <span className="tabular font-semibold">{formatCents(preview.patientReductionCents)} lower</span> estimated patient cost under these confirmed assumptions. Payment is not guaranteed.
      </p>
    </figure>
  );
}
