import type { Metadata } from "next";

import { SnapshotDetail } from "@/features/history/snapshot-detail";

export const metadata: Metadata = { title: "Saved analysis" };

export default async function SnapshotPage({ params }: PageProps<"/history/[id]">) {
  const { id } = await params;
  return <SnapshotDetail snapshotId={id} />;
}
