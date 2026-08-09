import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { generateStructuredGeminiJson, getGeminiErrorMessage } from '@/lib/gemini-structured';

type ClientOption = {
  id: string;
  clientId: string;
  name: string;
};

type OrderDraftResponse = {
  summary: string;
  draft: {
    clientId: string;
    item: string;
    fabric: string;
    totalPrice: number;
    deposit: number;
    status: string;
    dueDate: string;
    notes: string;
    paymentStatus: string;
    productionAllowed: string;
  };
};

const statuses = ['Inquiry', 'Awaiting Deposit', 'Fabric Sourced', 'Cutting', 'Sewing', 'Fitting', 'Finishing', 'Ready', 'Delivered'];

function extractFirstMoneyValue(text: string): number | null {
  const m = text.match(/\$\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?)/i);
  const raw = m?.[1] || m?.[2];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractDateIso(text: string): string {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return iso?.[1] || '';
}

function fallbackOrderDraft(prompt: string): OrderDraftResponse {
  const trimmed = prompt.replace(/\s+/g, ' ').trim();
  const totalPrice = extractFirstMoneyValue(trimmed) ?? 0;
  const suggestedDeposit = totalPrice > 0 ? Math.round(totalPrice * 0.5 * 100) / 100 : 0;

  return {
    summary: 'AI service was unavailable, so a starter draft was created from your notes. Please review and adjust before saving.',
    draft: {
      clientId: '',
      item: trimmed || 'Custom garment request',
      fabric: '',
      totalPrice,
      deposit: Math.min(suggestedDeposit, totalPrice),
      status: 'Inquiry',
      dueDate: extractDateIso(trimmed),
      notes: trimmed,
      paymentStatus: '',
      productionAllowed: 'HOLD',
    },
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  let promptForFallback = '';

  try {
    const body = await req.json();
    const prompt = String(body.prompt || '').trim();
    promptForFallback = prompt;
    const clients = Array.isArray(body.clients) ? (body.clients as ClientOption[]) : [];
    const hasAudio = !!(body.audioBase64 && body.audioMimeType);

    // A voice note can stand in for a typed prompt — Gemini transcribes it.
    if (!prompt && !hasAudio) {
      return NextResponse.json({ error: 'Add a typed prompt or a voice note.' }, { status: 400 });
    }

    const userPrompt = prompt
      || 'Create the order draft from the attached voice note. Transcribe and use everything the speaker says.';

    const response = await generateStructuredGeminiJson<OrderDraftResponse>({
      schemaPrompt: `You are helping an African luxury fashion admin team create an order draft.
Return valid JSON only with this exact shape:
{
  "summary": string,
  "draft": {
    "clientId": string,
    "item": string,
    "fabric": string,
    "totalPrice": number,
    "deposit": number,
    "status": string,
    "dueDate": string,
    "notes": string,
    "paymentStatus": string,
    "productionAllowed": string
  }
}
Rules:
- Pick clientId only from this list if there is a clear match: ${JSON.stringify(clients)}.
- The clientId field in your response must be the internal id value from the chosen client object, not the display clientId code.
- If there is no clear match, return an empty string for clientId.
- Use one of these statuses only: ${statuses.join(', ')}.
- Use productionAllowed as GO or HOLD only.
- Use dueDate as YYYY-MM-DD when the request implies a date, otherwise empty string.
- paymentStatus may be empty string if unknown.
- Deposit should not exceed totalPrice.
- Make the summary a short plain-English explanation of what was inferred and any uncertainty.`,
      userPrompt,
      images: Array.isArray(body.images) ? body.images : [],
      audio: body.audioBase64 && body.audioMimeType ? { data: body.audioBase64, mimeType: body.audioMimeType } : null,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('Order AI draft error:', error);
    const fallback = fallbackOrderDraft(promptForFallback);
    return NextResponse.json({
      ...fallback,
      warning: getGeminiErrorMessage(error),
      source: 'template',
    });
  }
}