"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAnalysis, useAnalysisController } from "@/features/analysis/analysis-provider";
import { formatIsoDate } from "@/lib/domain/dates";

// "Is this your report?" (FRONTEND_DESIGN.md §7). Shown when a source's name
// or date of birth doesn't match the analysis. Nothing from that source is
// merged until the person decides, and the choice is explicit: no Escape or
// outside-click dismissal.

function IdentityColumn({ heading, name, dateOfBirth, missingName }: { heading: string; name: string | null; dateOfBirth: string | null; missingName: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-sm text-muted-foreground">{heading}</dt>
      <dd className="space-y-0.5">
        <p className="font-medium break-words">{name ?? missingName}</p>
        <p className="text-sm text-muted-foreground">{dateOfBirth ? `Born ${formatIsoDate(dateOfBirth)}` : "No date of birth"}</p>
      </dd>
    </div>
  );
}

export function IdentityCheckDialog({ analysisId }: { analysisId: string }) {
  const analysis = useAnalysis(analysisId);
  const { resolveIdentityCheck, removeSource, setReportFile } = useAnalysisController();
  const check = analysis?.identityCheck ?? null;

  if (!analysis || !check) return null;

  const patientName = analysis.patient?.fullName ?? analysis.patient?.displayName ?? null;
  const fromReport = check.requestKey === "report";
  const sourceNoun = fromReport ? "report" : "conversation";

  function acceptSource() {
    resolveIdentityCheck(analysisId, true);
  }

  function skipSource() {
    resolveIdentityCheck(analysisId, false);
  }

  function skipAndRemoveFile() {
    resolveIdentityCheck(analysisId, false);
    const reportId = analysis?.reportFile?.reportId;
    if (reportId) removeSource(analysisId, reportId);
    setReportFile(analysisId, null);
  }

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg">Is this your {sourceNoun}?</DialogTitle>
          <DialogDescription>
            The name or date of birth in this {sourceNoun} doesn&apos;t match this analysis. We haven&apos;t added anything from it yet.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-4 border-y py-4 sm:grid-cols-2">
          <IdentityColumn
            heading={fromReport ? "The report says" : "The conversation says"}
            name={check.reportName}
            dateOfBirth={check.reportDateOfBirth}
            missingName="No name found"
          />
          <IdentityColumn heading="This analysis is for" name={patientName} dateOfBirth={analysis.patient?.dateOfBirth ?? null} missingName="No name entered" />
        </dl>
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
          <Button onClick={acceptSource}>Yes, use this {sourceNoun}</Button>
          <Button variant="outline" onClick={skipSource}>
            No, don&apos;t use it
          </Button>
          {fromReport && analysis.reportFile && (
            <Button variant="ghost" onClick={skipAndRemoveFile}>
              No, and remove the file
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
