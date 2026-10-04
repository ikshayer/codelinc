// PLANNER SCAFFOLD — ownership transfers to the UX/API/AI agent (src/app/**).
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dental Payment & Scheduling Optimizer (synthetic demo)",
  description: "Evidence-backed dental visit and care-plan optimizer. Synthetic data only.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
