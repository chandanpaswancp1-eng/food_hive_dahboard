import { NextResponse } from "next/server";
import type { AlertsPayload } from "@/lib/types";
import { getActiveAlerts } from "@/lib/grubtech/alerts";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";

export async function GET() {
  try {
    const alerts = await getActiveAlerts();
    const payload: AlertsPayload = { alerts, fetchedAt: new Date().toISOString() };
    return NextResponse.json(payload);
  } catch (error) {
    if (isDbConnectionError(error)) return dbErrorResponse(error);
    throw error;
  }
}
