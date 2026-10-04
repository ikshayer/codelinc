import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import { SiteHeader } from "@/components/shell/site-header";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnalysisProvider } from "@/features/analysis/analysis-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "CareWindow", template: "%s · CareWindow" },
  description: "Understand your dental costs and compare dentist-approved timing. Synthetic demo data only.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col bg-background">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <AnalysisProvider>
          <TooltipProvider>
            <SiteHeader />
            <main id="main" tabIndex={-1} className="flex-1 outline-none">
              {children}
            </main>
          </TooltipProvider>
        </AnalysisProvider>
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
