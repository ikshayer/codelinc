import { redirect } from "next/navigation";

export default async function AnalysisIndexPage({ params }: PageProps<"/analysis/[id]">) {
  const { id } = await params;
  redirect(`/analysis/${id}/intake`);
}
