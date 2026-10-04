import type { Metadata } from "next";
import { Suspense } from "react";

import { NewAnalysisScreen } from "@/features/intake/new-analysis-screen";

export const metadata: Metadata = { title: "New analysis" };

export default function NewAnalysisPage() {
  return (
    <Suspense>
      <NewAnalysisScreen />
    </Suspense>
  );
}
