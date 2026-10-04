import type { Metadata } from "next";

import { ConfirmScreen } from "@/features/analysis/confirm/confirm-screen";

export const metadata: Metadata = { title: "Confirm" };

export default async function ConfirmPage({ params }: PageProps<"/analysis/[id]/confirm">) {
  const { id } = await params;
  return <ConfirmScreen analysisId={id} />;
}
