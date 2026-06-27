import Anthropic from "@anthropic-ai/sdk";
import {
  SEMANTIC_OUTPUT_SCHEMA,
  type SemanticAnalyzeOptions,
  type SemanticClient,
  type SemanticResult,
} from "@specgate/conflict-engine";

export interface AnthropicSemanticClientOptions {
  /** Falls back to the ANTHROPIC_API_KEY environment variable. */
  apiKey?: string;
  maxOutputTokens?: number;
}

/**
 * SemanticClient backed by the Anthropic Messages API with strict JSON output.
 * This is an adapter — it is the only place a specific model vendor is named,
 * and it lives outside the neutrality-guarded engine packages.
 */
export class AnthropicSemanticClient implements SemanticClient {
  private readonly client: Anthropic;
  private readonly defaultMaxTokens: number;

  constructor(options: AnthropicSemanticClientOptions = {}) {
    this.client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});
    this.defaultMaxTokens = options.maxOutputTokens ?? 4096;
  }

  async analyze(prompt: string, options: SemanticAnalyzeOptions): Promise<SemanticResult> {
    // output_config is the canonical strict-JSON parameter; cast through unknown
    // so the code compiles across SDK minor versions that may not yet type it.
    const params = {
      model: options.model,
      max_tokens: options.maxOutputTokens ?? this.defaultMaxTokens,
      system:
        "You are a meticulous spec reviewer. You only report findings you are confident about, " +
        "and you always return JSON conforming to the requested schema.",
      messages: [{ role: "user", content: prompt }],
      output_config: {
        format: { type: "json_schema", schema: SEMANTIC_OUTPUT_SCHEMA },
      },
    };
    const response = await this.client.messages.create(
      params as unknown as Anthropic.MessageCreateParamsNonStreaming,
    );

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    try {
      const parsed = JSON.parse(text) as SemanticResult;
      return { findings: Array.isArray(parsed.findings) ? parsed.findings : [] };
    } catch {
      return { findings: [] };
    }
  }
}
