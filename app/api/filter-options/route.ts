import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { FilterOptions } from "@/lib/types";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";

export async function GET() {
  try {
    const [brands, locations, channels, paymentGroups] = await Promise.all([
      prisma.brand.findMany({ select: { name: true, cuisine: true }, orderBy: { name: "asc" } }),
      prisma.location.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
      prisma.channel.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
      prisma.order.findMany({
        select: { paymentMethod: true },
        distinct: ["paymentMethod"],
      }),
    ]);

    const payload: FilterOptions = {
      brands: brands.map((b) => b.name),
      cuisines: [...new Set(brands.map((b) => b.cuisine).filter((c): c is string => Boolean(c)))],
      locations: locations.map((l) => l.name),
      channels: channels.map((c) => c.name),
      paymentMethods: paymentGroups.map((p) => p.paymentMethod).filter((p): p is string => Boolean(p)),
    };

    return NextResponse.json(payload);
  } catch (error) {
    if (isDbConnectionError(error)) return dbErrorResponse(error);
    throw error;
  }
}
