import type { Metadata } from "next";
import { Suspense } from "react";

import { IntakeWorkspace } from "@/features/intake/intake-workspace";

export const metadata: Metadata = { title: "Describe" };

export default async function IntakePage({ params }: PageProps<"/analysis/[id]/intake">) {
  const { id } = await params;
  return (
    <Suspense>
      <IntakeWorkspace analysisId={id} />
    </Suspense>
  );
}
