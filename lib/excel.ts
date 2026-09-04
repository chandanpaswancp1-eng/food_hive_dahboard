import * as XLSX from "xlsx";
import officeCrypto from "officecrypto-tool";

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
}

function toCellString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Some hand-built workbooks put an instructional sentence in row 1 and the
 * real header in row 2 (e.g. "PASTE YOUR GRUBTECH EXPORT BELOW — keep these
 * exact headers (row 2)."). Scan the first few rows and pick the first one
 * that looks like a header row (multiple short cells) rather than assuming
 * row 1 is always it.
 */
function findHeaderRowIndex(sheet: XLSX.WorkSheet): number {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  for (let i = 0; i < Math.min(grid.length, 5); i++) {
    const row = grid[i] ?? [];
    const nonEmpty = row.filter((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "");
    const looksLikeSentence = nonEmpty.some((cell) => String(cell).length > 60);
    if (nonEmpty.length > 1 && !looksLikeSentence) return i;
  }
  return 0;
}

/**
 * Parses an .xlsx/.xls buffer into per-sheet, header-keyed rows, matching
 * the same all-string row shape lib/csv.ts produces so both feed
 * lib/grubtech/normalize.ts identically. Transparently decrypts
 * password-protected workbooks (GrubCenter exports are Office-encrypted)
 * when a password is supplied.
 *
 */
export async function parseWorkbook(buffer: Buffer, password?: string): Promise<ParsedSheet[]> {
  let workingBuffer = buffer;

  if (officeCrypto.isEncrypted(buffer)) {
    if (!password) {
      throw new Error(
        "This Excel file is password-protected. Set EXCEL_IMPORT_PASSWORD in .env.local.",
      );
    }
    workingBuffer = await officeCrypto.decrypt(buffer, { password });
  }

  const workbook = XLSX.read(workingBuffer, { type: "buffer", cellDates: true });

  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
      range: findHeaderRowIndex(sheet),
    });

    const rows = rawRows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toCellString(value)])),
    );

    return {
      sheetName,
      headers: rows.length ? Object.keys(rows[0]) : [],
      rows,
    };
  });
}
