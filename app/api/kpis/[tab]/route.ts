import { NextRequest, NextResponse } from "next/server";
import { TAB_IDS, type TabId } from "@/lib/types";
import { parseFilters } from "@/lib/filters";
import { buildTabPayload } from "@/lib/grubtech/kpis";

export async function GET(req: NextRequest, { params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;

  if (!(TAB_IDS as readonly string[]).includes(tab)) {
    return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 404 });
  }

  const filters = parseFilters(req.nextUrl.searchParams);
  const payload = await buildTabPayload(tab as TabId, filters);
  return NextResponse.json(payload);
}
