import type { Metadata } from "next";

import { Dashboard } from "@/features/history/dashboard";

export const metadata: Metadata = { title: "Home" };

export default function DashboardPage() {
  return <Dashboard />;
}
