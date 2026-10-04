import type { CalculationSourceMode, ConfirmedScenario, ProcedureId, ScenarioComparison } from "@/lib/domain/types";
import type { AnalysisPlanningContext, AnalysisScheduleLock } from "@analysis/types";

/**
 * Props for the record-driven comparison body. Shared by the live Compare
 * screen and the immutable History snapshot detail, so both render money
 * only from CalculationRecord / ScenarioComparison fields.
 */
export interface ComparisonViewProps {
  comparison: ScenarioComparison;
  /** The confirmed scenario the comparison was calculated from (dates, windows, deadlines). */
  scenario: ConfirmedScenario;
  procedureLabels: Record<ProcedureId, string>;
  sourceMode: CalculationSourceMode;
  /** Named fixture when sourceMode is "fixturePreview". */
  fixtureName: string | null;
  /** ISO timestamp the facts were confirmed. */
  confirmedAt: string;
  /** Historical snapshots are dated and read-only; they never present old facts as current. */
  historical: boolean;
  planning?: AnalysisPlanningContext;
  onPinDate?: (lock: AnalysisScheduleLock) => void;
}
