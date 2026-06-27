import Anthropic from "@anthropic-ai/sdk";
import type { SpecAssistantClient } from "@specgate/spec-assistant";

export interface AnthropicSpecAssistantOptions {
  /** Falls back to the ANTHROPIC_API_KEY environment variable. */
  apiKey?: string;
  maxOutputTokens?: number;
}

/** Strip a leading/trailing Markdown code fence if the model wrapped its output. */
function stripFences(text: string): string {
  const t = text.trim();
  const fence = t.match(/^```(?:[a-zA-Z]+)?\n([\s\S]*?)\n```$/);
  return fence ? fence[1]!.trim() : t;
}

/**
 * SpecAssistantClient backed by the Anthropic Messages API. Adapter only — the
 * co-author logic and re-gating live in @specgate/spec-assistant.
 */
export class AnthropicSpecAssistantClient implements SpecAssistantClient {
  private readonly client: Anthropic;
  private readonly defaultMaxTokens: number;

  constructor(options: AnthropicSpecAssistantOptions = {}) {
    this.client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});
    this.defaultMaxTokens = options.maxOutputTokens ?? 8000;
  }

  async improve(req: { prompt: string; model: string; maxOutputTokens?: number }): Promise<{ revisedSpec: string }> {
    const response = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxOutputTokens ?? this.defaultMaxTokens,
      system:
        "You revise software specifications to pass an automated quality gate. " +
        "You output only the full revised Markdown spec — no commentary, no code fences.",
      messages: [{ role: "user", content: req.prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { revisedSpec: stripFences(text) };
  }
}
