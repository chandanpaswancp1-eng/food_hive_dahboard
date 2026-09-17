/**
 * One-off cleanup for the duplicate-stockout-episode bug (see
 * lib/grubtech/ingestStockouts.ts). Before that fix, a repeat "Unavailable"
 * event for an item that was already unavailable (no "Available" in
 * between — confirmed from GrubCenter as "Master GrubKDS"/
 * "RECIPE_DUPLICATION_SERVICE" re-affirmations) opened a brand new
 * StockoutEvent row instead of being recognized as the same ongoing outage.
 * That inflated the "86 Items" count KPI (one real outage counted as
 * several) and left the earlier duplicate row permanently open — an
 * "Available" event only ever closes the *most recent* open row, so older
 * duplicates in a chain never got restoredAt set.
 *
 * This walks every item+brand+location's events in chronological order and
 * merges any run of consecutive "still open when the next one starts"
 * duplicates back into a single episode: the earliest row in the run is
 * kept (inheriting whichever restoredAt/durationMinutes the run ended up
 * with, if any), and the redundant duplicate rows are deleted.
 *
 * Usage:
 *   npm run cleanup:stockout-duplicates            # dry run — reports counts only
 *   npm run cleanup:stockout-duplicates -- --apply # actually writes the fix
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

interface Row {
  id: string;
  itemName: string;
  brandId: string | null;
  locationId: string | null;
  markedUnavailableAt: Date;
  restoredAt: Date | null;
}

function durationMinutes(from: Date, to: Date): number {
  return Math.round(((to.getTime() - from.getTime()) / 60_000) * 100) / 100;
}

async function main() {
  console.log(apply ? "Running in APPLY mode — rows will be updated/deleted.\n" : "Running in DRY-RUN mode — no writes will happen. Pass --apply to write.\n");

  const rows: Row[] = await prisma.stockoutEvent.findMany({
    select: { id: true, itemName: true, brandId: true, locationId: true, markedUnavailableAt: true, restoredAt: true },
    orderBy: [{ itemName: "asc" }, { brandId: "asc" }, { locationId: "asc" }, { markedUnavailableAt: "asc" }],
  });

  const toDelete: string[] = [];
  const toUpdate: { id: string; restoredAt: Date | null; durationMinutes: number | null }[] = [];
  let episodesCollapsed = 0;

  let i = 0;
  while (i < rows.length) {
    const groupKey = (r: Row) => `${r.itemName}|${r.brandId}|${r.locationId}`;
    let canonical = rows[i];
    let j = i + 1;

    while (j < rows.length && groupKey(rows[j]) === groupKey(canonical) && canonical.restoredAt === null) {
      // rows[j] started while `canonical`'s episode was still open — same
      // outage, re-affirmed. Fold it into canonical and drop the duplicate.
      const dup = rows[j];
      if (dup.restoredAt !== null) {
        canonical = { ...canonical, restoredAt: dup.restoredAt };
      }
      toDelete.push(dup.id);
      episodesCollapsed++;
      j++;
    }

    if (canonical.restoredAt !== rows[i].restoredAt) {
      toUpdate.push({
        id: canonical.id,
        restoredAt: canonical.restoredAt,
        durationMinutes: canonical.restoredAt ? durationMinutes(canonical.markedUnavailableAt, canonical.restoredAt) : null,
      });
    }

    i = j;
  }

  console.log(`Scanned ${rows.length} stockout events.`);
  console.log(`${episodesCollapsed} duplicate re-opened rows to delete, ${toUpdate.length} canonical rows need a restoredAt/durationMinutes update.`);

  if (toUpdate.length) {
    console.log("\nSample updates:");
    toUpdate.slice(0, 5).forEach((u) => console.log(`  ${u.id}: restoredAt -> ${u.restoredAt?.toISOString() ?? "null"}, durationMinutes -> ${u.durationMinutes}`));
  }

  if (apply) {
    const BATCH_SIZE = 500;
    for (let k = 0; k < toUpdate.length; k += BATCH_SIZE) {
      const batch = toUpdate.slice(k, k + BATCH_SIZE);
      await prisma.$transaction(
        batch.map((u) =>
          prisma.stockoutEvent.update({ where: { id: u.id }, data: { restoredAt: u.restoredAt, durationMinutes: u.durationMinutes } }),
        ),
      );
    }
    for (let k = 0; k < toDelete.length; k += BATCH_SIZE) {
      const batch = toDelete.slice(k, k + BATCH_SIZE);
      await prisma.stockoutEvent.deleteMany({ where: { id: { in: batch } } });
    }
    console.log("\nApplied.");
  } else if (episodesCollapsed > 0) {
    console.log("\nDry run only — re-run with --apply to write these changes.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
