import { getBackendDemo } from "@/lib/backend";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^(DEMO-ALEX-001|SYN-MEMBER-\d{4})$/.test(id)) {
    return Response.json({ error: "Synthetic demo record not found." }, { status: 404 });
  }
  return getBackendDemo(`/api/demo/members/${id}`);
}
