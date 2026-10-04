"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import BlurText from "@/components/BlurText";
import { BrandBackdrop } from "@/components/brand/brand-backdrop";
import { LincolnAbe } from "@/components/brand/lincoln-logo";
import { EASE_OUT, Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import { fixtureComparison } from "@/fixtures/calculation-fixtures";
import { SEEDED_DRAFT_ID } from "@/fixtures/seed-session";
import { formatCents } from "@/lib/domain/money";

const STEPS = [
  { title: "Add your details", detail: "A name is enough. Your details never enter the cost estimate." },
  { title: "Review the facts", detail: "Upload a report, talk it through or type it in, then check every value and its source." },
  { title: "Compare your options", detail: "See what you'd pay on each schedule your dentist has approved." },
];

const PRINCIPLES = [
  ["AI interprets", "An identified intake assistant gathers facts from your report or conversation. It never acts as your dentist."],
  ["Code calculates", "Every estimate comes from a traceable calculation record you can open, step by step."],
  ["Your dentist constrains", "Only dates your dentist approved are compared. If timing is unknown, care stays on its planned date."],
  ["You decide", "Nothing is compared until you confirm the facts, and payment is never guaranteed."],
] as const;

// Sample preview reads its numbers straight from the canonical fixture records.
const preview = fixtureComparison("canonical", 0);

export function Landing() {
  const controller = useAnalysisController();
  const router = useRouter();
  const returning = Object.values(controller.state.analyses).some((a) => a.id !== SEEDED_DRAFT_ID);

  function useSample() {
    const id = controller.startSampleAnalysis(controller.state.profile);
    router.push(`/analysis/${id}/confirm`);
  }

  return (
    <div>
      <section className="relative isolate overflow-hidden">
        <BrandBackdrop variant="hero" />
        {/* Keeps the headline legible over the brighter right side of the field. */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-primary/90 via-primary/50 to-transparent" />
        <div className="relative mx-auto grid max-w-[1120px] px-5 pt-16 pb-40 md:px-8 md:pt-24 md:pb-52 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <motion.p
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
              className="mb-5 flex items-center gap-2 text-sm font-medium text-white/85"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-white" />
              Your dental plan, made clearer
            </motion.p>
            <h1 className="font-display text-[2.5rem] leading-[2.875rem] font-semibold tracking-tight text-white sm:text-[3.5rem] sm:leading-[3.75rem] lg:text-[4.25rem] lg:leading-[4.5rem]">
              <BlurText
                as="span"
                text="A clearer picture of your dental costs."
                animateBy="words"
                delay={70}
                stepDuration={0.22}
                animationFrom={{ filter: "blur(10px)", opacity: 0, y: 16 }}
                animationTo={[{ filter: "blur(0px)", opacity: 1, y: 0 }]}
              />
            </h1>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5, ease: EASE_OUT }}
              className="mt-6 max-w-[34rem] text-lg text-pretty text-white/85"
            >
              Upload a report or talk it through. Review your details, then see what you&apos;d pay across dates your dentist has approved.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.65, ease: EASE_OUT }}
              className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3"
            >
              <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                <Button asChild size="lg" className="bg-white text-primary shadow-lg shadow-black/10 hover:bg-white/90">
                  <Link href="/analysis/new">Start an analysis</Link>
                </Button>
              </motion.div>
              <Button variant="link" className="px-0 text-base text-white underline-offset-4 hover:text-white" onClick={useSample}>
                Use sample
              </Button>
            </motion.div>
            {returning && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="mt-6 text-sm text-white/80">
                Picking up where you left off?{" "}
                <Link href="/dashboard" className="font-medium text-white underline underline-offset-4">
                  Go to your analyses
                </Link>
              </motion.p>
            )}
          </div>
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 14, delay: 0.35 }}
            className="hidden lg:col-span-4 lg:flex lg:items-start lg:justify-end lg:pt-6"
          >
            <LincolnAbe className="h-64 drop-shadow-[0_24px_40px_rgba(35,0,15,0.35)] xl:h-72" />
          </motion.div>
        </div>
      </section>

      <div className="relative mx-auto max-w-[1120px] px-5 md:px-8">
        <div className="-mt-28 grid gap-10 md:-mt-36 lg:grid-cols-12">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.45, ease: EASE_OUT }}
            className="lg:col-span-7 lg:col-start-6"
          >
            <ProductPreview />
          </motion.div>
          <Stagger delay={0.9} className="flex flex-col justify-end gap-4 lg:col-span-5 lg:col-start-1 lg:row-start-1 lg:pt-44">
            <StaggerItem>
              <p className="font-display text-2xl leading-8 font-semibold text-balance">Optimize the benefits. Never the care.</p>
            </StaggerItem>
            <StaggerItem>
              <p className="text-muted-foreground">
                Plans reset every benefit year. When your dentist allows a procedure in either year, the timing can change what you pay. CareWindow shows you how, with every number traceable.
              </p>
            </StaggerItem>
          </Stagger>
        </div>

        <section aria-labelledby="how-title" className="grid gap-10 py-20 md:py-28 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <h2 id="how-title" className="font-display text-section font-semibold tracking-tight">
              Three steps to a clear estimate
            </h2>
            <p className="mt-2 text-muted-foreground">Start with whatever you have. You can switch methods at any time without losing anything.</p>
          </Reveal>
          <ol className="grid gap-4 sm:grid-cols-3 lg:col-span-8">
            {STEPS.map((step, index) => (
              <Reveal key={step.title} delay={index * 0.1} className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-md">
                <li className="list-none">
                  <span aria-hidden className="font-display text-3xl font-semibold text-brand">
                    {index + 1}
                  </span>
                  <p className="mt-3 font-medium">{step.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{step.detail}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        <section aria-labelledby="principles-title" className="grid gap-10 border-t py-16 md:py-24 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <h2 id="principles-title" className="font-display text-[2rem] leading-10 font-semibold tracking-tight text-balance">
              Built on four promises
            </h2>
          </Reveal>
          <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:col-span-7">
            {PRINCIPLES.map(([term, detail], index) => (
              <Reveal key={term} delay={index * 0.08} className="border-l-2 border-brand/30 pl-4">
                <dt className="font-semibold">{term}</dt>
                <dd className="mt-1 text-muted-foreground">{detail}</dd>
              </Reveal>
            ))}
          </dl>
        </section>

        <footer className="flex flex-col gap-2 border-t py-8 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <span>Synthetic demo data only. CareWindow is not medical, dental or insurance advice.</span>
          <span>A CodeLinc concept for Lincoln Financial.</span>
        </footer>
      </div>
    </div>
  );
}

function ProductPreview() {
  const later = preview.cheaperAlternative!;
  return (
    <figure
      aria-label="Sample comparison preview"
      className="rounded-2xl border bg-card p-6 shadow-[0_1px_2px_rgba(35,31,32,0.04),0_24px_48px_-24px_rgba(101,0,48,0.35)] md:p-8"
    >
      <figcaption className="mb-6 flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>Sample comparison</span>
        <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Synthetic data</span>
      </figcaption>
      <div className="grid grid-cols-[1fr_1.25fr] items-end gap-4 sm:gap-6">
        <div>
          <p className="text-sm text-muted-foreground">All care this year</p>
          <p className="tabular mt-1 text-[1.75rem] leading-9 font-semibold tracking-tight text-muted-foreground md:text-[2rem]">{formatCents(preview.baseline.totalPatientCents)}</p>
          <p className="text-sm text-muted-foreground">you pay</p>
        </div>
        <div className="rounded-xl bg-accent px-4 py-3">
          <p className="text-sm text-accent-foreground">Crown in January</p>
          <p className="tabular mt-1 text-[2rem] leading-10 font-semibold tracking-tight text-primary md:text-[2.75rem] md:leading-[3.25rem]">{formatCents(later.totalPatientCents)}</p>
          <p className="text-sm text-accent-foreground">you pay</p>
        </div>
      </div>
      <PreviewTimeline />
      <p className="mt-5 border-t pt-4 text-sm">
        <span className="tabular font-semibold text-primary">{formatCents(preview.patientReductionCents)} lower</span> estimated patient cost under these confirmed assumptions. Payment is not guaranteed.
      </p>
    </figure>
  );
}

/** Illustrative timeline: the crown travels across the benefit-year boundary once, on load. */
function PreviewTimeline() {
  return (
    <div className="relative mt-8 h-16" aria-hidden>
      <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.9, delay: 0.8, ease: EASE_OUT }} className="absolute inset-x-0 top-7 h-px origin-left bg-border" />
      <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.4, delay: 1.3 }} className="absolute top-3 left-1/2 h-9 w-px origin-bottom bg-foreground/40" />
      <span className="absolute top-11 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap text-muted-foreground">New benefit year</span>
      {[12, 16, 20].map((left, index) => (
        <motion.span
          key={left}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1.1 + index * 0.08, type: "spring", stiffness: 400, damping: 20 }}
          className="absolute top-[1.4rem] size-2.5 rounded-full bg-muted-foreground/60"
          style={{ left: `${left}%` }}
        />
      ))}
      <span className="absolute top-[1.4rem] left-[36%] size-2.5 -translate-x-1/2 rounded-full border border-dashed border-muted-foreground" />
      <motion.span
        initial={{ left: "36%" }}
        animate={{ left: "64%" }}
        transition={{ delay: 1.7, duration: 1.1, ease: EASE_OUT }}
        className="absolute top-[1.15rem] flex -translate-x-1/2 flex-col items-center"
      >
        <span className="absolute -top-5 text-xs font-medium text-primary">Crown</span>
        <span className="size-3.5 rounded-full bg-primary ring-4 ring-accent" />
      </motion.span>
    </div>
  );
}
