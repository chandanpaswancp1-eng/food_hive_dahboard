/**
 * One-off backfill for the Asia/Dubai timezone fix (see lib/grubtech/dubaiTime.ts).
 *
 * Order.receivedDateKey/dayName/dayOfWeek/hour/timeSlot/timeOfDay were
 * derived from `receivedAt` using UTC instead of Dubai local time. Every
 * order placed 00:00-03:59 Dubai time was mislabeled onto the previous
 * calendar day (and, at a date-range filter's start boundary, dropped from
 * the range entirely) — this recomputes those columns for existing rows
 * from the already-correct `receivedAt` UTC instant, in place.
 *
 * Usage:
 *   npm run backfill:dubai-calendar            # dry run — reports counts only
 *   npm run backfill:dubai-calendar -- --apply # actually writes the fix
 */
import { PrismaClient } from "@prisma/client";
import {
  dubaiDateKey,
  dubaiDayName,
  dubaiDayOfWeek,
  dubaiHour,
} from "../lib/grubtech/dubaiTime";

const prisma = new PrismaClient();

// Mirrors normalize.ts's TIME_SLOTS/timeOfDayFor exactly — keep in sync if
// those ever change.
const TIME_SLOTS: [number, number, string][] = [
  [6, 11, "Breakfast"],
  [11, 15, "Lunch"],
  [15, 18, "Afternoon Snack"],
  [18, 22, "Dinner"],
  [22, 24, "Late Night"],
  [0, 6, "Overnight"],
];
function timeSlotFor(hour: number): string {
  return TIME_SLOTS.find(([start, end]) => hour >= start && hour < end)?.[2] ?? "Overnight";
}
function timeOfDayFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 21) return "Evening";
  return "Night";
}

const BATCH_SIZE = 500;
const apply = process.argv.includes("--apply");

async function main() {
  console.log(apply ? "Running in APPLY mode — rows will be updated.\n" : "Running in DRY-RUN mode — no writes will happen. Pass --apply to write.\n");

  let cursor: string | undefined;
  let scanned = 0;
  let changed = 0;
  const sample: string[] = [];

  for (;;) {
    const rows = await prisma.order.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        receivedAt: true,
        receivedDateKey: true,
        dayName: true,
        dayOfWeek: true,
        hour: true,
        timeSlot: true,
        timeOfDay: true,
      },
    });
    if (rows.length === 0) break;

    const updates: {
      id: string;
      receivedDateKey: string;
      dayName: string;
      dayOfWeek: number;
      hour: number;
      timeSlot: string;
      timeOfDay: string;
    }[] = [];

    for (const row of rows) {
      scanned++;
      const hour = dubaiHour(row.receivedAt);
      const next = {
        id: row.id,
        receivedDateKey: dubaiDateKey(row.receivedAt),
        dayName: dubaiDayName(row.receivedAt),
        dayOfWeek: dubaiDayOfWeek(row.receivedAt),
        hour,
        timeSlot: timeSlotFor(hour),
        timeOfDay: timeOfDayFor(hour),
      };

      const isDifferent =
        next.receivedDateKey !== row.receivedDateKey ||
        next.dayName !== row.dayName ||
        next.dayOfWeek !== row.dayOfWeek ||
        next.hour !== row.hour ||
        next.timeSlot !== row.timeSlot ||
        next.timeOfDay !== row.timeOfDay;

      if (isDifferent) {
        changed++;
        updates.push(next);
        if (sample.length < 10) {
          sample.push(
            `  ${row.id}: receivedDateKey ${row.receivedDateKey} -> ${next.receivedDateKey}, hour ${row.hour} -> ${next.hour}`,
          );
        }
      }
    }

    if (apply && updates.length) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.order.update({
            where: { id: u.id },
            data: {
              receivedDateKey: u.receivedDateKey,
              dayName: u.dayName,
              dayOfWeek: u.dayOfWeek,
              hour: u.hour,
              timeSlot: u.timeSlot,
              timeOfDay: u.timeOfDay,
            },
          }),
        ),
      );
    }

    cursor = rows[rows.length - 1].id;
    console.log(`Scanned ${scanned}, changed ${changed}...`);
  }

  console.log(`\nDone. ${changed} of ${scanned} orders needed correction.`);
  if (sample.length) {
    console.log("Sample of affected rows:");
    console.log(sample.join("\n"));
  }
  if (!apply && changed > 0) {
    console.log("\nDry run only — re-run with --apply to write these changes.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
