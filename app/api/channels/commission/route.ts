import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { round2 } from "@/lib/format";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";
import { invalidateTabCache } from "@/lib/grubtech/kpis";

// Manually sets a channel's commission rate, delivery/payment fee rate and
// optional flat per-order fee — GrubCenter never exposes any of these itself,
// so none has a sync/import source and all must be entered here. Keyed by channel name (not id): the
// frontend never sees a channel id anywhere (lib/filters.ts, /api/filter-options
// all key by name), and `name` is unique on Channel (prisma/schema.prisma). A
// manually-set rate survives every future sync/import — lib/grubtech/ingest.ts's
// resolveChannel only ever upserts `name`, never touching these rates on conflict.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { channel, commissionRate, deliveryChargeRate, perOrderFee, perOrderFeeMinOrder } = (body ?? {}) as {
    channel?: unknown;
    commissionRate?: unknown;
    deliveryChargeRate?: unknown;
    perOrderFee?: unknown;
    perOrderFeeMinOrder?: unknown;
  };
  const name = typeof channel === "string" ? channel.trim() : "";
  const rate = Number(commissionRate);
  const dcRate = Number(deliveryChargeRate);

  if (!name) {
    return NextResponse.json({ error: "channel is required" }, { status: 400 });
  }
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return NextResponse.json({ error: "commissionRate must be a number between 0 and 100" }, { status: 400 });
  }
  if (!Number.isFinite(dcRate) || dcRate < 0 || dcRate > 100) {
    return NextResponse.json({ error: "deliveryChargeRate must be a number between 0 and 100" }, { status: 400 });
  }
  // Optional — omitted means "leave the stored per-order fee as it is".
  const fee = perOrderFee === undefined ? undefined : Number(perOrderFee);
  const feeMin = perOrderFeeMinOrder === undefined ? undefined : Number(perOrderFeeMinOrder);
  if (fee !== undefined && (!Number.isFinite(fee) || fee < 0)) {
    return NextResponse.json({ error: "perOrderFee must be a number of 0 or more" }, { status: 400 });
  }
  if (feeMin !== undefined && (!Number.isFinite(feeMin) || feeMin < 0)) {
    return NextResponse.json({ error: "perOrderFeeMinOrder must be a number of 0 or more" }, { status: 400 });
  }

  try {
    const updated = await prisma.channel.update({
      where: { name },
      data: {
        commissionRate: round2(rate),
        deliveryChargeRate: round2(dcRate),
        ...(fee !== undefined ? { perOrderFee: round2(fee) } : {}),
        ...(feeMin !== undefined ? { perOrderFeeMinOrder: round2(feeMin) } : {}),
      },
    });
    // Every KPI tab is served from a short-lived cache (lib/grubtech/kpis/index.ts,
    // TAB_CACHE_TTL_MS) — without this, the dashboard's post-save refresh can
    // re-serve the pre-update payload for up to 20s, showing the old rate.
    invalidateTabCache();
    return NextResponse.json({
      channel: updated.name,
      commissionRate: Number(updated.commissionRate),
      deliveryChargeRate: Number(updated.deliveryChargeRate),
      perOrderFee: Number(updated.perOrderFee ?? 0),
      perOrderFeeMinOrder: Number(updated.perOrderFeeMinOrder ?? 0),
    });
  } catch (error) {
    if (isDbConnectionError(error)) return dbErrorResponse(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: `Channel "${name}" not found` }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
