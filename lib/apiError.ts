import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

const CONNECTION_ERROR_HINTS = [
  "invalid domain character",
  "can't reach database server",
  "authentication failed",
  "connection refused",
  "econnrefused",
  "timed out",
];

export function isDbConnectionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return CONNECTION_ERROR_HINTS.some((hint) => message.includes(hint));
  }
  return false;
}

function extractDetail(message: string): string {
  const lines = message
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("Invalid `"))
    .filter((line) => !line.startsWith("{"))
    .filter((line) => !line.startsWith("at "))
    .filter((line) => !/^[>\d|]/.test(line))
    .filter((line) => !line.includes("__TURBOPACK__") && !line.includes("__webpack"));

  const detail = lines[lines.length - 1] ?? message.trim();
  return detail.length > 220 ? `${detail.slice(0, 220)}…` : detail;
}

export function dbErrorResponse(error: unknown): NextResponse {
  const detail = error instanceof Error ? extractDetail(error.message) : String(error);
  return NextResponse.json(
    {
      error: "database_unavailable",
      message: `Database not reachable — check DATABASE_URL/DIRECT_URL in .env.local. (${detail})`,
    },
    { status: 503 },
  );
}
