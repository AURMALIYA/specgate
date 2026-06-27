import { loadConfig } from "@specgate/config";
import { AnthropicSemanticClient } from "@specgate/llm-adapter";
import { buildServer } from "./server.js";
import { SpecGateService } from "./service.js";

const configPath = process.env["SPECGATE_CONFIG"] ?? "config/default.config.yaml";
const port = Number(process.env["PORT"] ?? 8787);
const staticDir = process.env["DASHBOARD_DIR"] ?? "apps/dashboard/public";

const config = loadConfig(configPath);

// Wire the advisory semantic layer only when enabled in config and an API key
// is present; otherwise the layer is simply absent (never blocks).
const semanticClient =
  config.semantic?.enabled && process.env["ANTHROPIC_API_KEY"]
    ? new AnthropicSemanticClient()
    : undefined;

const service = new SpecGateService(config, { semanticClient });
const server = buildServer(service, { staticDir });

server.listen(port, () => {
  process.stdout.write(`SpecGate API + dashboard on :${port} (config: ${configPath})\n`);
});
