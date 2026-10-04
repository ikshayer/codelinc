import type { CalculationRecord, ScheduleAssignment } from "@/lib/domain/types";

/** Assignments in `record` whose year or date differs from the baseline schedule. */
export function movedAssignments(baseline: CalculationRecord, record: CalculationRecord): ScheduleAssignment[] {
  return record.schedule.assignments.filter((assignment) => {
    const original = baseline.schedule.assignments.find((a) => a.procedureId === assignment.procedureId);
    return !original || original.benefitYearId !== assignment.benefitYearId || original.serviceDate !== assignment.serviceDate;
  });
}
