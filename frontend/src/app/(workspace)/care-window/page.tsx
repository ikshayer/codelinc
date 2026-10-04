import type { Metadata } from "next";

import { CareWindowScreen } from "@/features/care-window/care-window-screen";

export const metadata: Metadata = { title: "Plan my care" };

export default function CareWindowPage() {
  return <CareWindowScreen />;
}
