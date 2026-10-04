import { CompassIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/feedback";
import { Page } from "@/components/shared/page";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Page width="form">
      <EmptyState icon={CompassIcon} title="This page doesn't exist" description="Check the address, or go back to your analyses.">
        <Button asChild>
          <Link href="/dashboard">Go to Home</Link>
        </Button>
      </EmptyState>
    </Page>
  );
}
