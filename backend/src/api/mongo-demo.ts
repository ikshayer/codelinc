import type { Db, Document } from "mongodb";
import { COLLECTIONS, DEMO_DATASET_ID, EXPANDED_DEMO_DATASET_ID } from "../db/collections.js";

type ApiReply = { status: number; body: Record<string, unknown> };

function publicDocument(document: Document | null): Record<string, unknown> | null {
  if (!document) return null;
  const { _id: _mongoId, ...rest } = document;
  void _mongoId;
  return rest;
}

function publicDocuments(documents: Document[]): Record<string, unknown>[] {
  return documents.map((document) => publicDocument(document)!);
}

function unavailable(): ApiReply {
  return { status: 503, body: { error: "Synthetic demo dataset has not been seeded or is not ready." } };
}

function missing(): ApiReply {
  return { status: 404, body: { error: "Synthetic demo record not found." } };
}

async function readyDataset(db: Db, datasetId: string): Promise<Document | null> {
  const manifest = await db.collection(COLLECTIONS.datasets).findOne({ dataset_id: datasetId });
  if (!manifest || (datasetId === EXPANDED_DEMO_DATASET_ID && manifest.status !== "ready")) return null;
  return manifest;
}

/** Read-only MongoDB API. All returned records are explicitly synthetic. */
export async function readMongoDemo(db: Db, path: string): Promise<ApiReply> {
  if (path === "/api/demo/health") {
    await db.command({ ping: 1 });
    const [golden, expanded] = await Promise.all([
      readyDataset(db, DEMO_DATASET_ID),
      readyDataset(db, EXPANDED_DEMO_DATASET_ID),
    ]);
    return {
      status: 200,
      body: {
        ok: true,
        synthetic_demo: true,
        datasets: {
          golden: golden ? "ready" : "missing",
          expanded: expanded ? "ready" : "missing",
        },
      },
    };
  }

  if (path === "/api/demo") {
    const [golden, expanded] = await Promise.all([
      readyDataset(db, DEMO_DATASET_ID),
      readyDataset(db, EXPANDED_DEMO_DATASET_ID),
    ]);
    if (!golden || !expanded) return unavailable();
    const plans = await db.collection(COLLECTIONS.plans)
      .find({ dataset_id: DEMO_DATASET_ID }, { projection: { _id: 0, plan_version_id: 1, display_name: 1, option_tier: 1, plan_type: 1 } })
      .sort({ option_tier: 1 }).toArray();
    return {
      status: 200,
      body: {
        synthetic_demo: true,
        dataset_id: EXPANDED_DEMO_DATASET_ID,
        generated_at: expanded.generated_at,
        counts: expanded.counts,
        plans,
        golden_member_id: "DEMO-ALEX-001",
      },
    };
  }

  const memberMatch = /^\/api\/demo\/members\/(DEMO-ALEX-001|SYN-MEMBER-\d{4})$/.exec(path);
  if (memberMatch) {
    const memberId = memberMatch[1]!;
    const datasetId = memberId === "DEMO-ALEX-001" ? DEMO_DATASET_ID : EXPANDED_DEMO_DATASET_ID;
    if (!await readyDataset(db, datasetId)) return unavailable();
    const member = await db.collection(COLLECTIONS.memberSnapshots).findOne({ dataset_id: datasetId, member_id: memberId }, { sort: { observed_at: -1 } });
    if (!member) return missing();
    const [plan, card, claims] = await Promise.all([
      db.collection(COLLECTIONS.plans).findOne({ dataset_id: DEMO_DATASET_ID, plan_version_id: member.plan_version_id }),
      db.collection(COLLECTIONS.procedureCards).findOne({ dataset_id: datasetId, member_id: memberId }),
      datasetId === EXPANDED_DEMO_DATASET_ID
        ? db.collection(COLLECTIONS.claims).find({ dataset_id: datasetId, member_id: memberId }).sort({ service_date: -1, claim_id: 1 }).toArray()
        : Promise.resolve([]),
    ]);
    if (!plan) return { status: 409, body: { error: "Member references a missing plan version." } };
    return {
      status: 200,
      body: {
        synthetic_demo: true,
        dataset_id: datasetId,
        member: publicDocument(member),
        plan: publicDocument(plan),
        procedure_card: publicDocument(card),
        claims: publicDocuments(claims),
      },
    };
  }

  if (path === "/api/demo/providers") {
    if (!await readyDataset(db, EXPANDED_DEMO_DATASET_ID)) return unavailable();
    const providers = await db.collection(COLLECTIONS.providers)
      .find({ dataset_id: EXPANDED_DEMO_DATASET_ID })
      .sort({ provider_id: 1 }).toArray();
    return { status: 200, body: { synthetic_demo: true, providers: publicDocuments(providers) } };
  }

  return missing();
}
