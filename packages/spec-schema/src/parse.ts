import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import { matchSection } from "./sections.js";

export interface RawParse {
  frontmatterRaw: unknown;
  /** Section id -> trimmed body text. */
  sections: Record<string, string>;
  presentSections: string[];
  contentHash: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export class SpecParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpecParseError";
  }
}

export function contentHash(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Split a spec document into frontmatter + canonical sections. Headings of
 * level 1–3 (`#`, `##`, `###`) start sections; a leading numeric prefix such
 * as `3.` is tolerated.
 */
export function splitDocument(raw: string): RawParse {
  const hash = contentHash(raw);

  const fmMatch = raw.match(FRONTMATTER_RE);
  if (!fmMatch) {
    throw new SpecParseError(
      "Missing YAML frontmatter (a `---` delimited block at the top of the document).",
    );
  }
  let frontmatterRaw: unknown;
  try {
    frontmatterRaw = parseYaml(fmMatch[1] ?? "");
  } catch (err) {
    throw new SpecParseError(`Frontmatter is not valid YAML: ${(err as Error).message}`);
  }

  const body = raw.slice(fmMatch[0].length);
  const lines = body.split(/\r?\n/);

  const sections: Record<string, string[]> = {};
  const presentSections: string[] = [];
  let current: string | null = null;

  const headingRe = /^#{1,3}\s+(.*\S)\s*$/;
  for (const line of lines) {
    const h = line.match(headingRe);
    if (h) {
      const def = matchSection(h[1] ?? "");
      if (def) {
        current = def.id;
        if (!sections[current]) {
          sections[current] = [];
          presentSections.push(current);
        }
        continue;
      }
      // Unrecognized heading: keep accumulating under the current section.
    }
    if (current) {
      (sections[current] ??= []).push(line);
    }
  }

  const trimmed: Record<string, string> = {};
  for (const [id, ls] of Object.entries(sections)) {
    trimmed[id] = ls.join("\n").trim();
  }

  return {
    frontmatterRaw,
    sections: trimmed,
    presentSections,
    contentHash: hash,
  };
}
