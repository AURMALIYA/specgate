import type { AccessMatrixRow } from "./types.js";

export interface AccessMatrixParse {
  rows: AccessMatrixRow[];
  problems: string[];
}

/** Canonical column header -> field. Headers are normalized before lookup. */
const COLUMN_ALIASES: Record<string, keyof AccessMatrixRow> = {
  role: "role",
  resource: "resource",
  visible: "visible",
  editable: "editable",
  data_scope: "data_scope",
  datascope: "data_scope",
  enforcement_layer: "enforcement_layer",
  enforcementlayer: "enforcement_layer",
  source_attribute: "source_attribute",
  sourceattribute: "source_attribute",
  deny_cases: "deny_cases",
  denycases: "deny_cases",
  fallback: "fallback",
};

const REQUIRED_FIELDS: (keyof AccessMatrixRow)[] = [
  "role",
  "resource",
  "visible",
  "editable",
  "data_scope",
  "enforcement_layer",
];

function normalizeHeader(h: string): string {
  return h
    .replace(/[*_`]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, "_")
    .replace(/_+/g, "_");
}

function parseBool(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (["true", "yes", "y", "✓", "x"].includes(v)) return true;
  if (["false", "no", "n", "-", "", "✗"].includes(v)) return false;
  return null;
}

function splitList(value: string): string[] {
  const v = value.trim();
  if (!v || v === "-" || v.toLowerCase() === "none") return [];
  return v
    .split(/[,;/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

const SEPARATOR_RE = /^\s*\|?[\s:|-]+\|?\s*$/;

/** Parse the first markdown table found in the section body. */
export function parseAccessMatrix(sectionBody: string): AccessMatrixParse {
  const problems: string[] = [];
  const lines = sectionBody.split(/\r?\n/).map((l) => l.trim());
  const tableLines = lines.filter((l) => l.includes("|") && l.length > 1);

  if (tableLines.length < 2) {
    return { rows: [], problems: ["No access-matrix table found."] };
  }

  const headerCells = splitRow(tableLines[0] ?? "").map(normalizeHeader);
  const fieldByIndex: (keyof AccessMatrixRow | null)[] = headerCells.map(
    (h) => COLUMN_ALIASES[h] ?? null,
  );

  for (const f of REQUIRED_FIELDS) {
    if (!fieldByIndex.includes(f)) {
      problems.push(`Access matrix is missing required column "${f}".`);
    }
  }

  const rows: AccessMatrixRow[] = [];
  // Data rows start after header (+ separator row, if present).
  let startIdx = 1;
  if (tableLines[1] && SEPARATOR_RE.test(tableLines[1])) startIdx = 2;

  for (let r = startIdx; r < tableLines.length; r++) {
    const line = tableLines[r] ?? "";
    if (SEPARATOR_RE.test(line)) continue;
    const cells = splitRow(line);

    const row: AccessMatrixRow = {
      role: "",
      resource: "",
      visible: false,
      editable: false,
      data_scope: "",
      enforcement_layer: "",
      source_attribute: "",
      deny_cases: [],
      fallback: "",
    };

    for (let c = 0; c < fieldByIndex.length; c++) {
      const field = fieldByIndex[c];
      if (!field) continue;
      const value = cells[c] ?? "";
      switch (field) {
        case "visible":
        case "editable": {
          const b = parseBool(value);
          if (b === null) {
            problems.push(
              `Row ${r - startIdx + 1}: "${field}" value "${value}" is not a boolean (true/false).`,
            );
            row[field] = false;
          } else {
            row[field] = b;
          }
          break;
        }
        case "deny_cases":
          row.deny_cases = splitList(value);
          break;
        default:
          row[field] = value.replace(/[*_`]/g, "").trim();
      }
    }

    if (!row.role || !row.resource) {
      problems.push(`Row ${r - startIdx + 1}: role and resource must both be non-empty.`);
      continue;
    }
    rows.push(row);
  }

  if (rows.length === 0 && problems.length === 0) {
    problems.push("Access-matrix table has a header but no data rows.");
  }

  return { rows, problems };
}
