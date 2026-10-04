"use client";

import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { EmptyState } from "@/components/shared/feedback";
import { Page } from "@/components/shared/page";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Page width="form">
      <EmptyState icon={TriangleAlertIcon} title="Something went wrong on this page" description="Your session data is kept in this tab. Try again, or go back to your analyses.">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to Home</Link>
        </Button>
      </EmptyState>
    </Page>
  );
}
