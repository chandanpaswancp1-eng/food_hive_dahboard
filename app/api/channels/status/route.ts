import { NextResponse } from "next/server";
import { getPortalStatusPayload } from "@/lib/portalStatus";

export async function GET() {
  return NextResponse.json(await getPortalStatusPayload());
}
