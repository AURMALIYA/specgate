import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

/**
 * Resolve CLI path arguments into a flat list of spec files. A directory is
 * walked recursively for `.md` files; a file path is taken as-is. Missing paths
 * are reported by the caller via the returned `missing` list.
 */
export function resolveSpecFiles(inputs: string[]): { files: string[]; missing: string[] } {
  const files: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();

  const add = (p: string) => {
    if (!seen.has(p)) {
      seen.add(p);
      files.push(p);
    }
  };

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && extname(entry.name) === ".md") add(full);
    }
  };

  for (const input of inputs) {
    if (!existsSync(input)) {
      missing.push(input);
      continue;
    }
    const st = statSync(input);
    if (st.isDirectory()) walk(input);
    else add(input);
  }

  return { files: files.sort(), missing };
}
