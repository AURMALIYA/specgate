import { loadConfig } from "@specgate/config";
import { AnthropicSemanticClient, AnthropicSpecAssistantClient } from "@specgate/llm-adapter";
import { LocalSpecAssistantClient } from "@specgate/spec-assistant";
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

const service = new SpecGateService(config, { semanticClient, assistantClient });
const server = buildServer(service, { staticDir });

server.listen(port, () => {
  process.stdout.write(
    `SpecGate API + dashboard on :${port} (config: ${configPath}; co-author: ${assistantKind})\n`,
  );
});
