/**
 * Milestone 2: the real ingestion path.
 *
 * Reuses the authenticated session saved by `npm run discover:grubcenter`
 * (scraper/storageState.json), heads to each GrubCenter report page
 * headless, and captures the same internal JSON responses the SPA itself
 * consumes — rather than reading the rendered DOM. Anything that looks like
 * an array of order-shaped objects gets normalized (lib/grubtech/normalize)
 * and ingested (lib/grubtech/ingest).
 *
 * REPORT_PAGES only has one confirmed path so far (the one you shared:
 * /realtime-reports/sales/channels). Add the other five once you've found
 * them in the GrubCenter nav (cancellations, prep time, ratings, delayed
 * orders, 86'd/sold-out items) — the sync loop below will pick them up
 * automatically.
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/db";
import { ingestRawOrders } from "../lib/grubtech/ingest";
import { invalidateDimensionCache } from "../lib/grubtech/kpis/shared";
import { invalidateTabCache } from "../lib/grubtech/kpis";

const BASE_URL = process.env.GRUBCENTER_BASE_URL ?? "https://grubcenter.grubtech.io";
const STORAGE_STATE_PATH = path.join(__dirname, "storageState.json");

const REPORT_PAGES: { label: string; path: string }[] = [
  { label: "Sales / Channels", path: "/realtime-reports/sales/channels" },
  // { label: "Cancellations", path: "/realtime-reports/..." },
  // { label: "Prep Time", path: "/realtime-reports/..." },
  // { label: "Ratings", path: "/realtime-reports/..." },
  // { label: "Delayed Orders", path: "/realtime-reports/..." },
  // { label: "86 Items", path: "/realtime-reports/..." },
];

function looksLikeOrderArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const sample = value[0];
  return typeof sample === "object" && sample !== null;
}

function extractOrderArrays(payload: unknown): unknown[][] {
  const found: unknown[][] = [];
  if (looksLikeOrderArray(payload)) found.push(payload);
  if (typeof payload === "object" && payload !== null) {
    for (const value of Object.values(payload)) {
      if (looksLikeOrderArray(value)) found.push(value);
    }
  }
  return found;
}

async function attemptLogin(page: import("playwright").Page) {
  const email = process.env.GRUBCENTER_EMAIL;
  const password = process.env.GRUBCENTER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "No valid session and GRUBCENTER_EMAIL/GRUBCENTER_PASSWORD are not set. Run `npm run discover:grubcenter` to log in by hand first.",
    );
  }
  // Best-guess selectors — adjust once you've seen GrubCenter's real login form.
  await page.goto(BASE_URL);
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
}

export async function runGrubcenterSync(): Promise<{ recordsIngested: number; issues: string[] }> {
  const syncLog = await prisma.syncLog.create({ data: { status: "RUNNING" } });
  const issues: string[] = [];
  let recordsIngested = 0;

  try {
    const browser = await chromium.launch({ headless: true });
    const context = existsSync(STORAGE_STATE_PATH)
      ? await browser.newContext({ storageState: STORAGE_STATE_PATH })
      : await browser.newContext();
    const page = await context.newPage();

    if (!existsSync(STORAGE_STATE_PATH)) {
      await attemptLogin(page);
    }

    for (const reportPage of REPORT_PAGES) {
      const capturedArrays: unknown[][] = [];

      const listener = async (response: import("playwright").Response) => {
        const contentType = response.headers()["content-type"] ?? "";
        if (!contentType.includes("application/json")) return;
        try {
          const body = await response.json();
          capturedArrays.push(...extractOrderArrays(body));
        } catch {
          // not JSON-parseable, ignore
        }
      };

      page.on("response", listener);
      await page.goto(`${BASE_URL}${reportPage.path}`, { waitUntil: "networkidle" });
      page.off("response", listener);

      if (page.url().includes("login")) {
        throw new Error("Session expired — run `npm run discover:grubcenter` again to re-authenticate.");
      }

      for (const rows of capturedArrays) {
        const result = await ingestRawOrders(rows);
        recordsIngested += result.ingested;
        issues.push(...result.issues);
      }

      if (!capturedArrays.length) {
        issues.push(`${reportPage.label}: no order-shaped JSON array was captured on this page.`);
      }
    }

    await browser.close();

    invalidateDimensionCache();
    invalidateTabCache();

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        recordsIngested,
        errorMessage: issues.length ? issues.slice(0, 20).join(" | ") : null,
      },
    });

    return { recordsIngested, issues };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: "ERROR", finishedAt: new Date(), errorMessage: message },
    });
    throw error;
  }
}

if (require.main === module) {
  runGrubcenterSync()
    .then((result) => {
      console.log(`Ingested ${result.recordsIngested} orders.`);
      if (result.issues.length) console.log("Issues:", result.issues);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Sync failed:", err.message ?? err);
      process.exit(1);
    });
}
