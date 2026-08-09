type InlineAsset = {
  mimeType: string;
  data: string;
};

type GeminiStructuredRequest = {
  schemaPrompt: string;
  userPrompt: string;
  images?: string[];
  audio?: InlineAsset | null;
};

export function getGeminiErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Failed to reach Gemini.';

  if (message.includes('GEMINI_API_KEY is not configured')) {
    return 'AI is not configured. Set GEMINI_API_KEY before using draft generation.';
  }

  if (
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('quota') ||
    message.includes('429')
  ) {
    return 'Gemini is configured, but the current key has no remaining quota or billing access. Update the Gemini project billing or replace the API key, then try again.';
  }

  if (message.includes('403') || message.toLowerCase().includes('api key not valid')) {
    return 'Gemini rejected the configured API key. Check that GEMINI_API_KEY is valid for the selected Google AI project.';
  }

  if (message.includes('404') || message.includes('no longer available to new users')) {
    return 'The configured Gemini model is no longer available. Set GEMINI_TEXT_MODEL to a current model such as gemini-2.5-flash.';
  }

  return message;
}

function parseDataUrl(dataUrl: string): InlineAsset | null {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

function cleanJsonBlock(value: string) {
  return value.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim();
}

export async function generateStructuredGeminiJson<T>({
  schemaPrompt,
  userPrompt,
  images = [],
  audio = null,
}: GeminiStructuredRequest): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const model = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
  const parts: Array<Record<string, unknown>> = [
    {
      text: `${schemaPrompt}\n\nUser request:\n${userPrompt}`,
    },
  ];

  for (const image of images) {
    const parsed = parseDataUrl(image);
    if (parsed) {
      parts.push({
        inlineData: parsed,
      });
    }
  }

  if (audio?.data && audio.mimeType) {
    parts.push({
      inlineData: audio,
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      }),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  return JSON.parse(cleanJsonBlock(text)) as T;
}