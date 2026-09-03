import { NextRequest, NextResponse } from "next/server";
import { TAB_IDS, type TabId } from "@/lib/types";
import { parseFilters } from "@/lib/filters";
import { buildTabPayload } from "@/lib/grubtech/kpis";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";

export async function GET(req: NextRequest, { params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;

  if (!(TAB_IDS as readonly string[]).includes(tab)) {
    return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 404 });
  }

  try {
    const filters = parseFilters(req.nextUrl.searchParams);
    const payload = await buildTabPayload(tab as TabId, filters);
    return NextResponse.json(payload);
  } catch (error) {
    if (isDbConnectionError(error)) return dbErrorResponse(error);
    throw error;
  }
}
