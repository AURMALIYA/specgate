import { loadConfig } from "@specgate/config";
import { AnthropicSemanticClient, AnthropicSpecAssistantClient } from "@specgate/llm-adapter";
import { GitHubHandoffTarget, GitHubIdentityProvider } from "@specgate/scm-adapter";
import { ReplitTarget } from "@specgate/replit-adapter";
import { DryRunTarget, type GenerationTarget } from "@specgate/dispatch";
import { StaticIdentityProvider, type IdentityProvider } from "@specgate/rbac";
import { LocalSpecAssistantClient } from "@specgate/spec-assistant";
import { AccessController } from "./access.js";
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

const service = new SpecGateService(config, {
  semanticClient,
  assistantClient,
  generationTarget,
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
const access = new AccessController(identity, undefined, authEnabled);

const server = buildServer(service, { staticDir, access });

server.listen(port, () => {
  process.stdout.write(
    `SpecGate API + dashboard on :${port} (config: ${configPath}; co-author: ${assistantKind}; ` +
      `auth: ${authEnabled ? "on" : "off"})\n`,
  );
});
