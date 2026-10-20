import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { config } from '../config';

export interface GenerateRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
}

/** Provider-independent interface the AI insights service depends on (SRS 2.5: configurable LLM API). */
export interface LlmProvider {
  readonly model: string;
  generate<T>(request: GenerateRequest<T>): Promise<T>;
}

class AnthropicProvider implements LlmProvider {
  private client = new Anthropic({ timeout: config.aiTimeoutMs, maxRetries: 0 });

  constructor(readonly model: string) {}

  async generate<T>({ system, prompt, schema }: GenerateRequest<T>): Promise<T> {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 4000,
      // If a safety classifier declines, the API retries on Anthropic's recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // Short factual summaries do not need deep reasoning; low effort keeps us inside the 10-second target.
      output_config: { effort: 'low', format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal') throw new Error('The model declined to answer.');
    if (!response.parsed_output) throw new Error('The model returned output that did not match the expected format.');
    return response.parsed_output;
  }
}

/**
 * Google Gemini over its REST API. The free tier (no card needed, key from aistudio.google.com)
 * covers the Flash and Flash-Lite models, which is plenty for summaries that are cached after one call.
 */
export class GeminiProvider implements LlmProvider {
  constructor(
    readonly model: string,
    private apiKey: string,
  ) {}

  async generate<T>({ system, prompt, schema }: GenerateRequest<T>): Promise<T> {
    // Gemini constrains its reply to this JSON Schema, derived from the same zod schema we validate with.
    const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      signal: AbortSignal.timeout(config.aiTimeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: jsonSchema, maxOutputTokens: 2000 },
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.error?.message ?? 'request failed'}`);

    const candidate = body.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) throw new Error(`Gemini returned no text (finish reason: ${candidate?.finishReason ?? 'unknown'}).`);
    return schema.parse(JSON.parse(text));
  }
}

let provider: LlmProvider | null | undefined;

export function getLlmProvider(): LlmProvider | null {
  if (provider === undefined) {
    provider =
      config.llmProvider === 'gemini'
        ? new GeminiProvider(config.llmModel, config.geminiApiKey)
        : config.llmProvider === 'anthropic'
          ? new AnthropicProvider(config.llmModel)
          : null;
  }
  return provider;
}

/** Test hook: inject a fake provider (or null for "not configured"). */
export function setLlmProvider(next: LlmProvider | null | undefined): void {
  provider = next;
}
