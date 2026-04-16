import { google } from "googleapis";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { weekSheetTitleForDate } from "@/lib/guatemala-week";

const GUATEMALA_TZ = "America/Guatemala";

const HEADERS = [
  "Date",
  "Day",
  "Meal #",
  "Foods",
  "Calories",
  "Daily Total",
  "Weekly Total",
];

export type MealSheetLogInput = {
  date: string;
  day: string;
  mealNumber: number;
  foods: string;
  calories: number;
  dailyTotal?: number;
  weeklyTotal?: number;
};

export type LogMealSheetResult = {
  dailyTotal: number;
  weeklyTotal: number;
  sheetSynced: boolean;
};

type SheetsClient = ReturnType<typeof google.sheets>;

/** Resolve spreadsheet ID: session override, else env default. */
export function resolveSpreadsheetId(sessionSheetId?: string | null): string | null {
  const fromSession = sessionSheetId?.trim();
  if (fromSession) return fromSession;
  const fromEnv = process.env.GOOGLE_SHEET_ID?.trim();
  return fromEnv || null;
}

function sheetConfigured(sessionSheetId?: string | null): boolean {
  const id = resolveSpreadsheetId(sessionSheetId);
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
      process.env.GOOGLE_PRIVATE_KEY?.trim() &&
      id
  );
}

function logSheetsEnv(effectiveSpreadsheetId: string): void {
  console.log("Sheet ID (env GOOGLE_SHEET_ID):", process.env.GOOGLE_SHEET_ID);
  console.log("Effective spreadsheet ID (session or env):", effectiveSpreadsheetId);
  console.log("Service account email:", process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  console.log("Private key exists:", !!process.env.GOOGLE_PRIVATE_KEY);
}

function createJwtAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") ?? "";
  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function escapeSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/** Range for append: TabName!A:G (quoted if tab has spaces). */
function appendRangeForTab(tabTitle: string): string {
  return `${escapeSheetTitle(tabTitle)}!A:G`;
}

/** Guatemala noon on calendar y-m-d → UTC (Guatemala has no DST). */
function utcNoonGuatemalaCalendar(y: number, month0: number, d: number): Date {
  return new Date(Date.UTC(y, month0, d, 18, 0, 0));
}

/** Week tab title for a row whose Date column is MM/dd/yyyy. */
function tabTitleForRowDate(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return weekSheetTitleForDate(new Date());
  const month0 = Number(m[1]) - 1;
  const day = Number(m[2]);
  const year = Number(m[3]);
  return weekSheetTitleForDate(utcNoonGuatemalaCalendar(year, month0, day));
}

function normalizeDateKey(cell: string): string {
  const m = String(cell).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return String(cell).trim();
  const mm = m[1].padStart(2, "0");
  const dd = m[2].padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

function parseCalories(cell: unknown): number {
  if (cell == null || cell === "") return 0;
  const n = Number(String(cell).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function ensureWeekSheetExistsWithClient(
  sheets: SheetsClient,
  spreadsheetId: string,
  tabTitle: string
): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === tabTitle);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: tabTitle,
              gridProperties: { rowCount: 500, columnCount: 10 },
            },
          },
        },
      ],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${escapeSheetTitle(tabTitle)}!A1:G1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [HEADERS] },
  });
}

export async function ensureWeekSheetExists(tabTitle: string): Promise<void> {
  if (!sheetConfigured(null)) return;

  const spreadsheetId = process.env.GOOGLE_SHEET_ID!.trim();
  const auth = createJwtAuth();
  await auth.authorize();
  const sheets = google.sheets({ version: "v4", auth });
  await ensureWeekSheetExistsWithClient(sheets, spreadsheetId, tabTitle);
}

/**
 * Append a meal row, then set Daily / Weekly totals from sums of column E
 * for that date and for the whole tab (week).
 * @param spreadsheetIdOverride TelegramSession.sheetId if set, else omit to use GOOGLE_SHEET_ID
 */
export async function logMealToSheet(
  data: MealSheetLogInput,
  spreadsheetIdOverride?: string | null
): Promise<LogMealSheetResult> {
  if (!sheetConfigured(spreadsheetIdOverride)) {
    console.warn(
      "[googleSheets] Skipping — set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_SHEET_ID or /setsheet"
    );
    return { dailyTotal: 0, weeklyTotal: 0, sheetSynced: false };
  }

  try {
    const spreadsheetId = resolveSpreadsheetId(spreadsheetIdOverride)!;
    const tabTitle = tabTitleForRowDate(data.date);

    console.log("Step A: Starting Google Sheets auth");
    logSheetsEnv(spreadsheetId);
    const auth = createJwtAuth();
    await auth.authorize();

    console.log("Step B: Auth complete, getting sheets client");
    const sheets = google.sheets({ version: "v4", auth });

    console.log("Step C: Checking/creating tab for week:", tabTitle);
    await ensureWeekSheetExistsWithClient(sheets, spreadsheetId, tabTitle);

    const rowData = [
      data.date,
      data.day,
      String(data.mealNumber),
      data.foods,
      String(data.calories),
      "",
      "",
    ];
    const appendRange = appendRangeForTab(tabTitle);
    console.log("Step D: Appending row with data:", rowData);
    console.log("Step D: Append range (TabName!A:G):", appendRange);

    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: appendRange,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [rowData] },
    });
    console.log("Step E: Append response:", JSON.stringify(appendRes.data));

    const q = escapeSheetTitle(tabTitle);
    const read = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${q}!A2:E2000`,
    });

    const rows = read.data.values ?? [];
    if (rows.length === 0) {
      return { dailyTotal: 0, weeklyTotal: 0, sheetSynced: true };
    }

    const dailyByKey = new Map<string, number>();
    let weekly = 0;
    for (const r of rows) {
      const dateCell = r[0] != null ? String(r[0]) : "";
      const cal = parseCalories(r[4]);
      weekly += cal;
      const key = normalizeDateKey(dateCell);
      dailyByKey.set(key, (dailyByKey.get(key) ?? 0) + cal);
    }

    const fg: string[][] = rows.map((r) => {
      const dateCell = r[0] != null ? String(r[0]) : "";
      const key = normalizeDateKey(dateCell);
      const d = dailyByKey.get(key) ?? 0;
      return [String(d), String(weekly)];
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${q}!F2:G${1 + rows.length}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: fg },
    });

    const rowDateKey = normalizeDateKey(data.date);
    const dailyTotal = dailyByKey.get(rowDateKey) ?? 0;

    return { dailyTotal, weeklyTotal: weekly, sheetSynced: true };
  } catch (error: any) {
    const apiData = error?.response?.data;
    console.error("Google Sheets full error:", error?.message, apiData);
    console.error("Google Sheets error.response.data (full):", JSON.stringify(apiData));
    throw error;
  }
}

/** For webhook copy: format `date` / `day` from a UTC instant in Guatemala. */
export function sheetDateDayFromUtc(atUtc: Date): { date: string; day: string } {
  const z = toZonedTime(atUtc, GUATEMALA_TZ);
  return {
    date: format(z, "MM/dd/yyyy"),
    day: format(z, "EEEE"),
  };
}
