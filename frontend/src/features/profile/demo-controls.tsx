"use client";

import { useId, useSyncExternalStore } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  getDemoScenarios,
  setDemoScenarios,
  subscribeDemoScenarios,
  type CalculationOutcomeSetting,
  type HistoryOutcome,
  type ReportOutcome,
  type VoiceOutcome,
} from "@/lib/adapters/mock/demo-scenarios";

const FAST_LATENCY_SCALE = 0.2;

const REPORT_OPTIONS: { value: ReportOutcome; label: string }[] = [
  { value: "success", label: "Reads normally" },
  { value: "unreadable", label: "Unreadable scan" },
  { value: "encrypted", label: "Encrypted PDF" },
  { value: "timeout", label: "Times out" },
  { value: "network", label: "Network failure" },
];

const VOICE_OPTIONS: { value: VoiceOutcome; label: string }[] = [
  { value: "normal", label: "Works normally" },
  { value: "reconnect", label: "Reconnects once" },
  { value: "providerFailure", label: "Provider fails" },
];

const HISTORY_OPTIONS: { value: HistoryOutcome; label: string }[] = [
  { value: "normal", label: "Works normally" },
  { value: "loadFails", label: "Loading fails" },
  { value: "saveFails", label: "Saving fails" },
  { value: "deleteFails", label: "Deleting fails" },
];

const CALCULATION_OPTIONS: { value: CalculationOutcomeSetting; label: string }[] = [
  { value: "normal", label: "Works normally" },
  { value: "fails", label: "Calculation fails" },
];

/** Switches that make the simulated services succeed or fail on purpose, for this browser session only. */
export function DemoControls() {
  const scenarios = useSyncExternalStore(subscribeDemoScenarios, getDemoScenarios, getDemoScenarios);
  const id = useId();

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <ScenarioSelect id={`${id}-report`} label="Report reading" value={scenarios.report} options={REPORT_OPTIONS} onChange={(report) => setDemoScenarios({ report })} />
        <ScenarioSelect id={`${id}-voice`} label="Voice conversation" value={scenarios.voice} options={VOICE_OPTIONS} onChange={(voice) => setDemoScenarios({ voice })} />
        <ScenarioSelect id={`${id}-history`} label="History" value={scenarios.history} options={HISTORY_OPTIONS} onChange={(history) => setDemoScenarios({ history })} />
        <ScenarioSelect id={`${id}-calc`} label="Comparison" value={scenarios.calculation} options={CALCULATION_OPTIONS} onChange={(calculation) => setDemoScenarios({ calculation })} />
      </div>
      <Field orientation="horizontal">
        <Checkbox
          id={`${id}-fast`}
          checked={scenarios.latencyScale < 1}
          onCheckedChange={(checked) => setDemoScenarios({ latencyScale: checked === true ? FAST_LATENCY_SCALE : 1 })}
          aria-describedby={`${id}-fast-help`}
        />
        <div className="space-y-1">
          <FieldLabel htmlFor={`${id}-fast`}>Fast demo timing</FieldLabel>
          <FieldDescription id={`${id}-fast-help`}>Shortens the simulated waits so each step finishes sooner.</FieldDescription>
        </div>
      </Field>
    </div>
  );
}

function ScenarioSelect<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect id={id} value={value} onChange={(event) => {
          const selected = options.find((option) => option.value === event.target.value);
          if (selected) onChange(selected.value);
        }} className="w-full max-w-xs">
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}
