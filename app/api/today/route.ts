import { NextResponse } from "next/server";
import { dubaiDateKey } from "@/lib/grubtech/dubaiTime";

export async function GET() {
  return NextResponse.json({ todayGst: dubaiDateKey(new Date()) });
}
