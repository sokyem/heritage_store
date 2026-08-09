import { NextRequest, NextResponse } from 'next/server';
import { generateStructuredGeminiJson, getGeminiErrorMessage } from '@/lib/gemini-structured';

// POST /api/transcribe/translate
// Translate a consultation transcript or notes into another language using
// Gemini. Used by the post-call screen of the video consultation.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, targetLanguage } = body as { text?: string; targetLanguage?: string };

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Nothing to translate' }, { status: 400 });
    }
    if (!targetLanguage || !targetLanguage.trim()) {
      return NextResponse.json({ error: 'targetLanguage is required' }, { status: 400 });
    }

    const result = await generateStructuredGeminiJson<{ translation: string }>({
      schemaPrompt:
        `You are a professional translator for a luxury fashion atelier. Translate the ` +
        `consultation transcript/notes that the user provides into ${targetLanguage}. ` +
        `Preserve meaning, tone, proper names, garment terms, and any measurements or ` +
        `numbers exactly. Do not add commentary. Respond ONLY with JSON of the form ` +
        `{ "translation": "<the translated text>" }.`,
      userPrompt: text,
    });

    return NextResponse.json({ translation: result.translation || '' });
  } catch (error) {
    console.error('Translation failed:', error);
    return NextResponse.json({ error: getGeminiErrorMessage(error) }, { status: 502 });
  }
}
