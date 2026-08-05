import { randomBytes } from "crypto";
import ExcelJS from "exceljs";

export type ExportCell = string | number | null | undefined | Date | boolean;

export type TabularExportBuildInput = {
  sheetName: string;
  headers: string[];
  rows: ExportCell[][];
  format: "xlsx" | "csv";
  fileName: string;
};

export type TabularExportFileResult = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
};

/** CSV field: UTF-8-safe escaping for delimiter `;`. */
export function escapeCsvField(value: ExportCell): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return escapeCsvField(value.toISOString());
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  const s = String(value);
  if (/[;"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildTabularCsv(
  input: TabularExportBuildInput,
): TabularExportFileResult {
  const lines = [
    input.headers.map(escapeCsvField).join(";"),
    ...input.rows.map((row) => row.map(escapeCsvField).join(";")),
  ];
  const bom = "\uFEFF";
  return {
    buffer: Buffer.from(bom + lines.join("\n"), "utf8"),
    contentType: "text/csv; charset=utf-8",
    fileName: input.fileName,
  };
}

export async function buildTabularXlsx(
  input: TabularExportBuildInput,
): Promise<TabularExportFileResult> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Multi-Sale";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(input.sheetName || "Export", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRow(input.headers);
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.commit();

  for (const row of input.rows) {
    sheet.addRow(row);
  }

  sheet.columns.forEach((col) => {
    let max = 12;
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      const len = cell.value == null ? 0 : String(cell.value).length;
      if (len > max) max = Math.min(len + 2, 48);
    });
    col.width = max;
  });

  if (input.headers.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: input.headers.length },
    };
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName: input.fileName,
  };
}

export async function buildTabularExportFile(
  input: TabularExportBuildInput,
): Promise<TabularExportFileResult> {
  if (input.format === "csv") {
    return buildTabularCsv(input);
  }
  return buildTabularXlsx(input);
}

export function buildExportFileName(
  prefix: string,
  format: "xlsx" | "csv",
  at: Date = new Date(),
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}-${pad(at.getUTCHours())}-${pad(at.getUTCMinutes())}`;
  return `${prefix}-${stamp}.${format}`;
}

export function buildExportObjectKey(
  type: string,
  workspaceId: number,
  exportId: string,
  fileName: string,
): string {
  return `${type}-exports/${workspaceId}/${exportId}/${fileName}`;
}

export function newExportId(): string {
  return `exp_${randomBytes(12).toString("hex")}`;
}
