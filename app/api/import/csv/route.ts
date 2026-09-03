import { NextRequest, NextResponse } from "next/server";
import { parseCsv } from "@/lib/csv";
import { ingestRawOrders } from "@/lib/grubtech/ingest";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseCsv(text);
  const result = await ingestRawOrders(rows);
  return NextResponse.json(result);
}
