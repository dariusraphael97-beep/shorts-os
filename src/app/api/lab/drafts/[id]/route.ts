import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import { discardDraft } from "@/lib/supabase/repositories/your-videos";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const supabase = getServiceClient();
    await discardDraft(supabase, id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "discard failed" },
      { status: 500 },
    );
  }
}
