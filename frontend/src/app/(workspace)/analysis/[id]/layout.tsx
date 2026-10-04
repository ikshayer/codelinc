import { AnalysisFrame } from "@/features/analysis/components/analysis-frame";

export default async function AnalysisLayout({ children, params }: LayoutProps<"/analysis/[id]">) {
  const { id } = await params;
  return <AnalysisFrame analysisId={id}>{children}</AnalysisFrame>;
}
