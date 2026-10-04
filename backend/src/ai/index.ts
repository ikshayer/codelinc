/**
 * AI adapters (CONTRACT §6). Synthetic mode only: a deterministic card parser plus the
 * template explainer; zero network calls. Live (Bedrock) mode is deferred in v1.1 and falls
 * back to synthetic with an AI_UNAVAILABLE warning.
 */
import {
  CONTRACT_VERSION,
  isValidIsoDate,
  issue,
  parseUsd,
  type AiMode,
  type ExtractionRequest,
  type ExtractionResult,
  type Issue,
  type ProcedureRecommendation,
  type Specialty,
  type Urgency,
} from "@/domain";
import type { AiAdapters, AiModule, Explainer, ProcedureExtractor } from "@/domain/ports";
import { buildExplanationInput, normalizeText, templateExplain, validateExplanation } from "./explain";

// ---------------------------------------------------------------------------
// §6.1 Injection scanner (every line, every mode)
// ---------------------------------------------------------------------------

const INJECTION_PATTERNS = [
  /ignore (all |any )?(previous|prior|above) instructions/i,
  /\bsystem( override)?\b\s*[:.]/i,
  /\bdisregard\b/i,
  /\byou are (now )?(an?|the)\b/i,
  /\b(set|change|mark|make)\b.{0,60}\b(annual maximum|deductible|fees?|urgency|deadline|can plan later|act now)\b/i,
];

export function scanForInjection(text: string): { lines: string[]; ignored: ExtractionResult["ignored_instructions"] } {
  const lines: string[] = [];
  const ignored: ExtractionResult["ignored_instructions"] = [];
  for (const line of text.split(/\r?\n/)) {
    const norm = normalizeText(line);
    if (INJECTION_PATTERNS.some((re) => re.test(norm))) {
      ignored.push({ text: line.slice(0, 500), reason: "Instruction-like text in a document is treated as data and ignored." });
    } else {
      lines.push(line);
    }
  }
  return { lines, ignored };
}

// ---------------------------------------------------------------------------
// §6.1 Synthetic card parser (fixtures/synthetic/documents/card-2026-10-15.txt format)
// ---------------------------------------------------------------------------

const HEADER = /^\s*(\d+)\.\s+(?:Tooth #([0-9A-T]+)\s+-\s+)?(.+?)\s+-\s+Fee\s+(\$[\d,]+(?:\.\d{2})?)\s*$/;
const URGENCY: Record<string, Urgency> = { "ACT NOW": "act_now", "SCHEDULE SOON": "schedule_soon", "CAN PLAN LATER": "can_plan_later" };
const SPECIALTY_WORDS: [RegExp, Specialty][] = [
  [/general dentist/i, "general"],
  [/endodontist/i, "endodontist"],
  [/prosthodontist/i, "prosthodontist"],
  [/periodontist/i, "periodontist"],
  [/oral surgeon/i, "oral_surgeon"],
  [/pediatric/i, "pediatric"],
  [/orthodontist/i, "orthodontist"],
];
/** Documented inference table: posterior tooth-colored fillings by surface count. */
const POSTERIOR = new Set(["1", "2", "3", "4", "5", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "28", "29", "30", "31", "32"]);
const INFER_CODE: [RegExp, string][] = [
  [/tooth-colored, (1|one) surface\b/i, "D2391"],
  [/tooth-colored, (2|two) surfaces\b/i, "D2392"],
];

function usDate(text: string | undefined): string | null {
  const m = text ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text) : null;
  if (!m) return null;
  const iso = `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : null;
}

function parseCard(lines: string[], req: ExtractionRequest): ProcedureRecommendation[] {
  const items: { n: string; header: RegExpExecArray; body: string[] }[] = [];
  for (const line of lines) {
    const h = HEADER.exec(line);
    if (h) items.push({ n: h[1]!, header: h, body: [] });
    else if (items.length && /^\s+\S/.test(line)) items[items.length - 1]!.body.push(line.trim()); // body lines are indented
  }
  const ids = new Map<string, string>();
  const used = new Set<string>();
  const procs = items.map(({ n, header, body }) => {
    const tooth = header[2] ?? null;
    const rawDesc = header[3]!;
    let code = /\((D\d{4})\)/.exec(rawDesc)?.[1] ?? null;
    const desc = rawDesc.replace(/\s*\(D\d{4}\)/, "").trim();
    const inferred: ProcedureRecommendation["inferred_fields"] = [];
    if (!code && tooth && POSTERIOR.has(tooth)) {
      code = INFER_CODE.find(([re]) => re.test(desc))?.[1] ?? null;
      if (code) inferred.push("cdt_code");
    }
    const base = `proc-${code ? code.toLowerCase() : "unknown"}-${tooth?.toLowerCase() ?? "na"}`;
    let id = base;
    for (let k = 2; used.has(id); k++) id = `${base}-${k}`;
    used.add(id);
    ids.set(n, id);

    const timing = body.find((l) => /^Dentist timing:/i.test(l));
    const specialtyLine = body.find((l) => /^May be performed by/i.test(l));
    const specialties = specialtyLine ? SPECIALTY_WORDS.filter(([re]) => re.test(specialtyLine)).map(([, s]) => s) : [];
    const fee = parseUsd(header[4]!);
    return {
      after: body.map((l) => /^After #(\d+)\.\s*Wait at least (\d+) days(?: and no more than (\d+) days)?/i.exec(l)).find(Boolean) ?? null,
      proc: {
        procedure_id: id,
        description: `${desc}${tooth ? `, tooth ${tooth}` : ""}`.slice(0, 200),
        cdt_code: code,
        tooth,
        dentist_fee: {
          input_id: `proc.${id}.dentist_fee`,
          value: { kind: "exact", cents: fee },
          source: "PROVIDER",
          observed_at: req.as_of,
        },
        urgency: URGENCY[/timing:\s*([A-Z ]+?)\./i.exec(timing ?? "")?.[1]?.toUpperCase() ?? ""] ?? null,
        earliest_safe_date: usDate(/Earliest ([\d/]+)/i.exec(timing ?? "")?.[1]),
        target_date: usDate(/Target ([\d/]+)/i.exec(timing ?? "")?.[1]),
        latest_safe_date: usDate(/No later than ([\d/]+)/i.exec(timing ?? "")?.[1]),
        dependencies: [],
        allowed_specialties: specialties.length ? specialties : ["general"],
        alternative_group_id: null,
        source: { kind: req.kind, document_id: req.document_id, dentist_statements: body.map((l) => l.slice(0, 500)) },
        inferred_fields: inferred,
        confirmation: { status: "UNVERIFIED", confirmed_by: null, confirmed_at: null },
      } satisfies ProcedureRecommendation as ProcedureRecommendation,
    };
  });
  for (const { after, proc } of procs) {
    const dep = after ? ids.get(after[1]!) : undefined;
    if (after && dep) {
      proc.dependencies = [{ depends_on: dep, min_gap_days: Number(after[2]), max_gap_days: after[3] ? Number(after[3]) : null }];
    }
  }
  return procs.map((p) => p.proc);
}

const unavailable = () =>
  issue("AI_UNAVAILABLE", "warning", "Automatic reading is not available for this document; enter procedures manually.", { field: "procedures" });

function syntheticExtractor(liveRequested: boolean): ProcedureExtractor {
  return {
    mode: "synthetic",
    async extract(req) {
      const warnings: Issue[] = liveRequested ? [unavailable()] : [];
      let procedures: ProcedureRecommendation[] = [];
      let ignored: ExtractionResult["ignored_instructions"] = [];
      try {
        if (req.text !== null) {
          const scanned = scanForInjection(req.text);
          ignored = scanned.ignored;
          procedures = parseCard(scanned.lines, req);
        }
      } catch {
        procedures = [];
      }
      if (ignored.length) {
        warnings.push(
          issue("PROMPT_INJECTION_SUSPECTED", "warning", "Some lines looked like instructions and were ignored; check the procedures carefully.", {
            field: "text",
          }),
        );
      }
      if (procedures.length === 0 && !liveRequested) warnings.push(unavailable());
      return {
        contract_version: CONTRACT_VERSION,
        mode: "synthetic",
        document_id: req.document_id,
        procedures,
        ignored_instructions: ignored,
        warnings,
        raw_retained: false,
      };
    },
  };
}

const templateExplainer: Explainer = { mode: "template", explain: async (input) => templateExplain(input) };

export const createAiAdapters: AiModule["createAiAdapters"] = (options = {}): AiAdapters => {
  const requested: AiMode = options.mode ?? (process.env.AI_MODE === "live" ? "live" : "synthetic");
  return {
    // ponytail: live Bedrock adapter deferred (CONTRACT §6.1); add src/ai/bedrock.server.ts when enabled.
    mode: "synthetic",
    extractor: syntheticExtractor(requested === "live"),
    explainer: templateExplainer,
    templateExplainer,
  };
};

export { buildExplanationInput, validateExplanation };

export const aiModule = { createAiAdapters, validateExplanation, buildExplanationInput } satisfies AiModule;
