import { loadConfig } from "@specgate/config";
import { buildServer } from "./server.js";
import { SpecGateService } from "./service.js";

const configPath = process.env["SPECGATE_CONFIG"] ?? "config/default.config.yaml";
const port = Number(process.env["PORT"] ?? 8787);

const config = loadConfig(configPath);
const service = new SpecGateService(config);
const server = buildServer(service);

server.listen(port, () => {
  process.stdout.write(`SpecGate API listening on :${port} (config: ${configPath})\n`);
});
