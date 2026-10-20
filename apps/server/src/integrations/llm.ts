import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
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

let provider: LlmProvider | null | undefined;

export function getLlmProvider(): LlmProvider | null {
  if (provider === undefined) provider = config.llmProvider === 'anthropic' ? new AnthropicProvider(config.llmModel) : null;
  return provider;
}

/** Test hook: inject a fake provider (or null for "not configured"). */
export function setLlmProvider(next: LlmProvider | null | undefined): void {
  provider = next;
}
