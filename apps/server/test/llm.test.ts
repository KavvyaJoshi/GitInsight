import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { GeminiProvider } from '../src/integrations/llm';

const fetchMock = vi.spyOn(globalThis, 'fetch');
const schema = z.object({ summary: z.string(), highlights: z.array(z.string()) });

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => fetchMock.mockReset());

describe('GeminiProvider', () => {
  it('sends the system prompt and a JSON schema, and parses the structured reply', async () => {
    fetchMock.mockResolvedValueOnce(reply({ candidates: [{ content: { parts: [{ text: '{"summary":"A toolkit.","highlights":["Fast"]}' }] } }] }));
    const provider = new GeminiProvider('gemini-3.5-flash-lite', 'test-key');

    const result = await provider.generate({ system: 'Be factual.', prompt: 'Summarise.', schema });
    expect(result).toEqual({ summary: 'A toolkit.', highlights: ['Fast'] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(String(init!.body));
    expect(body.systemInstruction.parts[0].text).toBe('Be factual.');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseJsonSchema.properties.summary.type).toBe('string');
    expect(body.generationConfig.responseJsonSchema.$schema).toBeUndefined();
  });

  it('rejects replies that do not match the schema', async () => {
    fetchMock.mockResolvedValueOnce(reply({ candidates: [{ content: { parts: [{ text: '{"summary":42}' }] } }] }));
    await expect(new GeminiProvider('m', 'k').generate({ system: '', prompt: '', schema })).rejects.toThrow();
  });

  it('surfaces quota and API errors so the dashboard can fall back', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: { message: 'Resource has been exhausted' } }, 429));
    await expect(new GeminiProvider('m', 'k').generate({ system: '', prompt: '', schema })).rejects.toThrow(/Gemini 429: Resource has been exhausted/);
  });
});
