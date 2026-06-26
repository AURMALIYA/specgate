import type { SensitiveSurface, SpecGateConfig } from "@specgate/config";
import type { ParsedSpec } from "@specgate/spec-schema";
import type { SurfaceHit } from "./types.js";

/** Convert a glob (supporting `**`, `*`, `?`) to an anchored RegExp. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // ** matches across path separators
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++; // consume trailing slash of **/
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") re += "[^/]";
    else if ("\\^$.|+()[]{}".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp(`^${re}$`, "i");
}

function safeRegExp(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

export interface ScanInput {
  spec: ParsedSpec;
  /** Additional changed/generated artifact paths from a diff, when available. */
  changedPaths?: string[];
}

function frontmatterValues(spec: ParsedSpec): string[] {
  const fm = spec.frontmatter as Record<string, unknown>;
  const out: string[] = [];
  for (const v of Object.values(fm)) {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) out.push(...v.map((x) => String(x)));
  }
  return out;
}

function scanSurface(surface: SensitiveSurface, input: ScanInput): SurfaceHit[] {
  const { spec } = input;
  const hits: SurfaceHit[] = [];
  const push = (
    matcherType: SurfaceHit["matcherType"],
    pattern: string,
    evidence: string,
  ): void => {
    hits.push({
      surfaceId: surface.id,
      surfaceLabel: surface.label,
      restricted: surface.restricted,
      forcesTier: surface.forcesTier,
      matcherType,
      pattern,
      evidence,
    });
  };

  // pathGlobs vs spec path + changed paths
  const paths = [spec.path, ...(input.changedPaths ?? [])].filter(Boolean) as string[];
  for (const glob of surface.matchers.pathGlobs) {
    const re = globToRegExp(glob);
    for (const p of paths) {
      if (re.test(p)) push("pathGlob", glob, p);
    }
  }

  // metadataFieldPatterns vs frontmatter values
  const fmValues = frontmatterValues(spec);
  for (const pat of surface.matchers.metadataFieldPatterns) {
    const re = safeRegExp(pat);
    if (!re) continue;
    for (const v of fmValues) {
      if (re.test(v)) push("metadataField", pat, v);
    }
  }

  // keywords vs body text (word-boundary aware, so "pan" does not match "expand")
  const bodyText = Object.values(spec.sections).join("\n");
  for (const kw of surface.matchers.keywords) {
    const kwRe = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    const m = bodyText.match(kwRe);
    if (m && m.index !== undefined) {
      const idx = m.index;
      const snippet = bodyText.slice(Math.max(0, idx - 20), idx + kw.length + 20).replace(/\n/g, " ");
      push("keyword", kw, `…${snippet.trim()}…`);
    }
  }

  // contractSignals vs declared contracts + integration-contracts section
  const contractText = [
    spec.sections["integration_contracts"] ?? "",
    ...spec.frontmatter.contracts.flatMap((c) => [c.name, c.ref ?? ""]),
  ].join("\n");
  for (const sig of surface.matchers.contractSignals) {
    const re = safeRegExp(sig);
    if (re && re.test(contractText)) {
      const m = contractText.match(re);
      push("contractSignal", sig, m ? m[0] : sig);
    }
  }

  return hits;
}

/** Scan a spec against all configured sensitive surfaces. */
export function scanSensitiveSurfaces(config: SpecGateConfig, input: ScanInput): SurfaceHit[] {
  return config.sensitiveSurfaces.flatMap((s) => scanSurface(s, input));
}
