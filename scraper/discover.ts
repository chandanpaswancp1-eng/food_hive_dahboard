/**
 * Milestone 1: run this once, by hand, to find out what GrubCenter's own
 * report pages actually call under the hood.
 *
 * Usage:
 *   npm run discover:grubcenter
 *
 * A real (headed) Chromium window opens at GRUBCENTER_BASE_URL. Log in
 * yourself (including any 2FA) and click through each of the 6 report tabs
 * you use day to day (Sales/Channels, Cancellations, Prep Time, Ratings,
 * Delayed Orders, and wherever "86'd"/sold-out items live). Every JSON
 * network response the page receives while you do that gets written to
 * scraper/discovery-output/<timestamp>.json (auth headers are redacted —
 * only *whether* a header was present is recorded, not its value), and your
 * authenticated session is saved to scraper/storageState.json so
 * `npm run sync:once` can reuse it without logging in again.
 *
 * When you're done clicking around, come back to the terminal and press
 * Enter to stop capturing and close the browser.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import path from "node:path";

const BASE_URL = process.env.GRUBCENTER_BASE_URL ?? "https://grubcenter.grubtech.io";
const OUT_DIR = path.join(__dirname, "discovery-output");
const STORAGE_STATE_PATH = path.join(__dirname, "storageState.json");

const REDACTED_HEADERS = new Set(["authorization", "cookie", "set-cookie", "x-api-key", "x-auth-token"]);

interface CapturedExchange {
  method: string;
  url: string;
  status: number;
  requestHeaderNames: string[];
  responseSample: unknown;
}

function redactHeaders(headers: Record<string, string>): string[] {
  return Object.keys(headers);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const captured: CapturedExchange[] = [];

  page.on("response", async (response) => {
    const headers = response.headers();
    const contentType = headers["content-type"] ?? "";
    if (!contentType.includes("application/json")) return;

    // Skip the app's own static/config bundles, keep report/data-shaped calls.
    const url = response.url();
    if (url.includes(".js") || url.includes("/static/")) return;

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      return;
    }

    captured.push({
      method: response.request().method(),
      url,
      status: response.status(),
      requestHeaderNames: redactHeaders(response.request().headers()).filter((h) => !REDACTED_HEADERS.has(h.toLowerCase())),
      responseSample: body,
    });

    console.log(`captured: ${response.request().method()} ${url} -> ${response.status()}`);
  });

  await page.goto(BASE_URL);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("\nBrowser opened. Log in and click through your report pages.");
  console.log("Every JSON response the page receives is being captured.");
  await rl.question("\nWhen you're done, press Enter here to stop and save...\n");
  rl.close();

  await context.storageState({ path: STORAGE_STATE_PATH });

  const outFile = path.join(OUT_DIR, `capture-${Date.now()}.json`);
  writeFileSync(outFile, JSON.stringify(captured, null, 2));

  console.log(`\nSaved ${captured.length} captured JSON exchanges to ${outFile}`);
  console.log(`Saved authenticated session to ${STORAGE_STATE_PATH}`);
  console.log("\nShare the capture file's contents so normalize.ts can be matched to the real field names.");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
