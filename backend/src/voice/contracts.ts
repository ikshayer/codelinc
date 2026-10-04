import { z } from "zod";

// Intake-only vocabulary. Engine contracts and confirmed facts stay untouched.
const fields: Record<string, "string" | "boolean"> = {};
for (const year of ["y1", "y2"]) {
  for (const key of ["startsOn", "endsOn", "annualMaximum", "alreadyUsed", "deductible", "deductibleSatisfied"]) fields[`plan.${year}.${key}`] = "string";
}
fields["plan.y2.rulesUnchanged"] = "boolean";
for (const category of ["preventive", "basic", "major"]) {
  fields[`plan.rules.${category}.insurerPercent`] = "string";
  fields[`plan.rules.${category}.deductibleApplies`] = "boolean";
  fields[`plan.rules.${category}.maximumApplies`] = "boolean";
}
for (const id of ["p1", "p2", "p3", "p4"]) {
  for (const key of ["label", "category", "fee", "anchorDate"]) fields[`care.${id}.${key}`] = "string";
  for (const key of ["deadline", "after", "minGapDays", "y1.earliest", "y1.latest", "y2.earliest", "y2.latest"]) fields[`timing.${id}.${key}`] = "string";
}
export const intakeFields = Object.freeze(fields);
export const sessionInput = z.object({ analysisId: z.string().min(1).max(150), revision: z.number().int().nonnegative(), consent: z.literal(true),
  memberId: z.string().regex(/^(DEMO-ALEX-001|SYN-MEMBER-\d{4})$/).optional(),
  facts: z.record(z.string().max(120), z.object({ value: z.union([z.string().max(500), z.boolean(), z.null()]), status: z.enum(["proposed", "conflict", "confirmed"]) }).strict()).refine((facts) => Object.keys(facts).length <= 150).optional(),
}).strict();
export const turnInput = z.union([
  z.object({ text: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ audio: z.string().min(60).max(2_800_000), mimeType: z.literal("audio/wav") }).strict(),
]);
export type TurnInput = z.infer<typeof turnInput>;
export const modelReply = z.object({
  transcript: z.string().max(4000),
  reply: z.string().trim().min(1).max(480),
  proposals: z.array(z.object({ fieldPath: z.string(), value: z.union([z.string().max(500), z.boolean(), z.null()]), quote: z.string().min(1).max(4000) })).max(80),
  overflow: z.array(z.object({ label: z.string().max(200), quote: z.string().min(1).max(4000) })).max(20),
});
export type ModelReply = z.infer<typeof modelReply>;
// Gemini accepts a JSON Schema subset. Keep application limits in modelReply;
// String/array bounds in the larger intake schema exceed its supported grammar.
export const replySchema = {
  type: "object",
  properties: {
    transcript: { type: "string" },
    reply: { type: "string", description: "At most two short sentences, no more than 480 characters." },
    proposals: { type: "array", items: {
      type: "object", properties: { fieldPath: { type: "string" }, value: { type: ["string", "boolean", "null"] }, quote: { type: "string" } },
      required: ["fieldPath", "value", "quote"], additionalProperties: false,
    } },
    overflow: { type: "array", items: {
      type: "object", properties: { label: { type: "string" }, quote: { type: "string" } },
      required: ["label", "quote"], additionalProperties: false,
    } },
  },
  required: ["transcript", "reply", "proposals", "overflow"], additionalProperties: false,
};

export function extraction(reply: ModelReply, transcript: string, sessionId: string, turnId: string) {
  const evidence: { id: string; kind: "voice"; sourceId: string; sourceLabel: string; turnId: string; literalQuote: string; receivedAt: string }[] = [];
  const addEvidence = (quote: string) => {
    const id = `${turnId}:e${evidence.length + 1}`;
    evidence.push({ id, kind: "voice", sourceId: sessionId, sourceLabel: "Conversation", turnId, literalQuote: quote, receivedAt: new Date().toISOString() });
    return id;
  };
  const proposals = reply.proposals.flatMap((p) => {
    const kind = intakeFields[p.fieldPath];
    if (!kind || p.value === null || typeof p.value !== kind || !transcript.includes(p.quote)) return [];
    // Do not accept malformed numeric/date/category values even from structured output.
    if (typeof p.value === "string") {
      if (/\.(fee|annualMaximum|alreadyUsed|deductible|deductibleSatisfied)$/.test(p.fieldPath) && !/^\d+(\.\d{1,2})?$/.test(p.value)) return [];
      if (p.fieldPath.endsWith("insurerPercent") && (!/^\d+(\.\d{1,2})?$/.test(p.value) || Number(p.value) > 100)) return [];
      if (p.fieldPath.endsWith("category") && !["preventive", "basic", "major"].includes(p.value)) return [];
      if (/\.(startsOn|endsOn|anchorDate|earliest|latest|deadline)$/.test(p.fieldPath)) {
        const date = new Date(`${p.value}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(p.value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== p.value) return [];
      }
      if (p.fieldPath.endsWith("minGapDays") && !/^\d{1,4}$/.test(p.value)) return [];
      if (p.fieldPath.endsWith("after") && !/^p[1-4](,p[1-4])*$/.test(p.value)) return [];
    }
    return [{ fieldPath: p.fieldPath, value: p.value, evidenceId: addEvidence(p.quote) }];
  });
  const overflow = reply.overflow.filter((p) => transcript.includes(p.quote)).map((p) => ({ label: p.label, evidenceId: addEvidence(p.quote) }));
  return { proposals, evidence, overflow, missingFieldPaths: [], reviewNotes: [] };
}

/** Read a JSON string prefix during generation, ignoring an incomplete escape. */
export function replyPrefix(json: string): string {
  const match = /"reply"\s*:\s*"/.exec(json);
  if (!match) return "";
  const start = match.index + match[0].length;
  let result = "";
  for (let i = start; i < json.length; i++) {
    const c = json[i];
    if (c === '"') break;
    if (c !== "\\") { result += c; continue; }
    const escape = json[++i];
    if (!escape) break;
    if (escape === "u") {
      const hex = json.slice(i + 1, i + 5);
      if (!/^[\da-f]{4}$/i.test(hex)) break;
      result += String.fromCharCode(parseInt(hex, 16)); i += 4;
    } else {
      const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" };
      if (!(escape in escapes)) break;
      result += escapes[escape];
    }
  }
  return result;
}
