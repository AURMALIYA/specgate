import { loadConfig } from "@specgate/config";
import { AnthropicSemanticClient, AnthropicSpecAssistantClient } from "@specgate/llm-adapter";
import { DryRunMerger, GitHubHandoffTarget, GitHubIdentityProvider, GitHubMerger, type PullRequestMerger } from "@specgate/scm-adapter";
import { ReplitTarget } from "@specgate/replit-adapter";
import { DryRunTarget, type GenerationTarget } from "@specgate/dispatch";
import { FileProjectStore, StaticIdentityProvider, type IdentityProvider, type ProjectStore } from "@specgate/rbac";
import { FileProvenanceStore, type ProvenanceStore } from "@specgate/provenance";
import { LocalSpecAssistantClient } from "@specgate/spec-assistant";
import { join } from "node:path";
import { AccessController } from "./access.js";
import { RateLimiter } from "./ratelimit.js";
import { buildServer } from "./server.js";
import { SpecGateService } from "./service.js";

const configPath = process.env["SPECGATE_CONFIG"] ?? "config/default.config.yaml";
const port = Number(process.env["PORT"] ?? 8787);
const staticDir = process.env["DASHBOARD_DIR"] ?? "apps/dashboard/public";

const config = loadConfig(configPath);

// Wire the advisory semantic layer only when enabled in config and an API key
// is present; otherwise the layer is simply absent (never blocks).
const hasKey = !!process.env["ANTHROPIC_API_KEY"];
const semanticClient =
  config.semantic?.enabled && hasKey ? new AnthropicSemanticClient() : undefined;
// Co-author: use the model-backed client when an API key is present, otherwise
// fall back to the offline, rule-based assistant so it works with no key.
const assistantClient =
  config.semantic?.model && hasKey
    ? new AnthropicSpecAssistantClient()
    : new LocalSpecAssistantClient(config);
const assistantKind = config.semantic?.model && hasKey ? "model" : "local (offline, rule-based)";

// Generation target (admin "Run"): dry-run by default. With SPECGATE_TARGET=git
// or =replit plus a GITHUB_TOKEN + SPECGATE_REPO, dispatch seeds a real branch
// (Replit additionally returns an import URL; live API call needs REPLIT_API_*).
const repo = process.env["SPECGATE_REPO"];
const ghToken = process.env["GITHUB_TOKEN"];
const targetKind = process.env["SPECGATE_TARGET"] ?? "dry-run";
let generationTarget: GenerationTarget = new DryRunTarget();
if ((targetKind === "git" || targetKind === "replit") && ghToken && repo) {
  const handoff = new GitHubHandoffTarget({ token: ghToken, repo });
  generationTarget =
    targetKind === "replit"
      ? new ReplitTarget({ handoff, token: process.env["REPLIT_API_TOKEN"], apiUrl: process.env["REPLIT_API_URL"] })
      : handoff;
}

// Durable persistence (audit log + RBAC config) when SPECGATE_DATA_DIR is set;
// in-memory otherwise. Specs/registry are derived from git (re-ingested), so the
// durable state is the override audit log and the project/role config.
const dataDir = process.env["SPECGATE_DATA_DIR"];
const provenanceStore: ProvenanceStore | undefined = dataDir
  ? new FileProvenanceStore(join(dataDir, "provenance.json"))
  : undefined;
const projectStore: ProjectStore | undefined = dataDir
  ? new FileProjectStore(join(dataDir, "projects.json"))
  : undefined;

// Merge: real GitHub merge when a token is present, else a no-op dry-run.
const merger: PullRequestMerger = ghToken ? new GitHubMerger({ token: ghToken }) : new DryRunMerger();

const service = new SpecGateService(config, {
  semanticClient,
  assistantClient,
  generationTarget,
  merger,
  provenanceStore,
  defaultRepo: repo,
});

// RBAC: GitHub identity in production; a static provider for local/dev. Enforcement
// is opt-in via SPECGATE_AUTH=on (off keeps the keyless local dashboard working).
const authEnabled = process.env["SPECGATE_AUTH"] === "on";
const identity: IdentityProvider =
  process.env["SPECGATE_IDENTITY"] === "github"
    ? new GitHubIdentityProvider()
    : new StaticIdentityProvider({
        "dev-admin": { id: "admin", name: "Dev Admin" },
        "dev-contributor": { id: "contrib", name: "Dev Contributor" },
        "dev-developer": { id: "developer", name: "Dev Developer" },
      });
const access = new AccessController(identity, projectStore, authEnabled);

// Optional fixed-window rate limiting (requests/min per credential or address).
const rateLimit = Number(process.env["SPECGATE_RATE_LIMIT"] ?? "");
const rateLimiter = Number.isInteger(rateLimit) && rateLimit > 0 ? new RateLimiter(60_000, rateLimit) : undefined;

const server = buildServer(service, { staticDir, access, rateLimiter });

server.listen(port, () => {
  process.stdout.write(
    `SpecGate API + dashboard on :${port} (config: ${configPath}; co-author: ${assistantKind}; ` +
      `auth: ${authEnabled ? "on" : "off"}; persist: ${dataDir ?? "memory"}; ` +
      `rate-limit: ${rateLimiter ? `${rateLimit}/min` : "off"})\n`,
  );
});
