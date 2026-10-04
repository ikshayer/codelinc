import type { Metadata } from "next";

import { CompareScreen } from "@/features/analysis/compare/compare-screen";

export const metadata: Metadata = { title: "Compare" };

export default async function ComparePage({ params }: PageProps<"/analysis/[id]/compare">) {
  const { id } = await params;
  return <CompareScreen analysisId={id} />;
}
