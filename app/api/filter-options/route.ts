import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { FilterOptions } from "@/lib/types";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";
import { isTestFixtureName } from "@/lib/grubtech/testFixture";

export async function GET() {
  try {
    const [brands, locations, channels, paymentGroups, dateKeyGroups] = await Promise.all([
      prisma.brand.findMany({ select: { name: true, cuisine: true }, orderBy: { name: "asc" } }),
      prisma.location.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
      prisma.channel.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
      prisma.order.findMany({
        select: { paymentMethod: true },
        distinct: ["paymentMethod"],
      }),
      prisma.order.findMany({
        select: { receivedDateKey: true },
        distinct: ["receivedDateKey"],
      }),
    ]);

    // Every calendar month with data, derived from the day keys already
    // stored on each order — so a new month shows up on its own once its
    // first order lands, with nothing to maintain.
    const months = [
      ...new Set(dateKeyGroups.map((g) => g.receivedDateKey?.slice(0, 7)).filter((m): m is string => Boolean(m))),
    ].sort((a, b) => (a < b ? 1 : -1));

    // The sandbox brand/channel are excluded from every dashboard query, so
    // offering them as a filter would only ever select nothing.
    const realBrands = brands.filter((b) => !isTestFixtureName("brand", b.name));
    const realChannels = channels.filter((c) => !isTestFixtureName("channel", c.name));

    const payload: FilterOptions = {
      brands: realBrands.map((b) => b.name),
      cuisines: [...new Set(realBrands.map((b) => b.cuisine).filter((c): c is string => Boolean(c)))],
      locations: locations.map((l) => l.name),
      channels: realChannels.map((c) => c.name),
      paymentMethods: paymentGroups.map((p) => p.paymentMethod).filter((p): p is string => Boolean(p)),
      months,
    };

    return NextResponse.json(payload);
  } catch (error) {
    if (isDbConnectionError(error)) return dbErrorResponse(error);
    throw error;
  }
}
