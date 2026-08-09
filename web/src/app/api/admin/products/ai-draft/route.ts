import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { generateStructuredGeminiJson, getGeminiErrorMessage } from '@/lib/gemini-structured';

type ProductDraftResponse = {
  summary: string;
  draft: {
    name: string;
    description: string;
    longDescription: string;
    category: string;
    subcategory: string;
    gender: string;
    price: number;
    compareAtPrice: number | null;
    costPrice: number | null;
    sizes: string;
    colors: string;
    materials: string;
    totalStock: number;
    tags: string;
    isPublished: boolean;
    isFeatured: boolean;
    isNewArrival: boolean;
  };
};

const categoryGuide = {
  'ready-to-wear': ['dress', 'blouse', 'skirt', 'pants', 'jumpsuit', 'two-piece', 'co-ord set', 'jacket', 'coat'],
  'traditional-wear': ['agbada', 'dashiki', 'kaftan', 'boubou', 'wrapper', 'aso-oke', 'ankara-dress', 'ankara-suit', 'kente-outfit', 'senator'],
  ceremonial: ['wedding-gown', 'aso-ebi', 'traditional-wedding', 'engagement', 'naming-ceremony', 'chieftaincy'],
  jewelry: ['necklace', 'bracelet', 'earrings', 'ring', 'anklet', 'waist-beads', 'brooch', 'cufflinks', 'body-chain'],
  accessories: ['bag', 'clutch', 'belt', 'scarf', 'fan', 'shawl'],
  headwear: ['gele', 'headwrap', 'crown', 'kufi', 'fila', 'fascinator', 'hat'],
  fabric: ['ankara', 'kente', 'aso-oke', 'adire', 'mud-cloth', 'kitenge', 'lace', 'brocade'],
};

function firstSentence(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const i = cleaned.search(/[.!?]/);
  return i > 0 ? cleaned.slice(0, i + 1) : cleaned;
}

function estimatePrice(prompt: string): number {
  const m = prompt.match(/\$\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?)/i);
  const raw = m?.[1] || m?.[2];
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return 150;
}

function fallbackProductDraft(prompt: string): ProductDraftResponse {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  const sentence = firstSentence(cleaned);
  const name = sentence ? sentence.slice(0, 80) : 'New AWULA K Product';

  return {
    summary: 'AI service was unavailable, so a starter product draft was created from your notes. Please review and refine before saving.',
    draft: {
      name,
      description: sentence || 'Premium fashion piece from AWULA K.',
      longDescription: cleaned || 'Add product details, fit notes, and styling guidance.',
      category: 'ready-to-wear',
      subcategory: 'dress',
      gender: 'women',
      price: estimatePrice(cleaned),
      compareAtPrice: null,
      costPrice: null,
      sizes: '[]',
      colors: '[]',
      materials: '[]',
      totalStock: 0,
      tags: '[]',
      isPublished: false,
      isFeatured: false,
      isNewArrival: true,
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
    const hasAudio = !!(body.audioBase64 && body.audioMimeType);

    // A voice note can stand in for a typed prompt — Gemini transcribes and
    // uses the audio. Only require something to work from.
    if (!prompt && !hasAudio) {
      return NextResponse.json({ error: 'Add a typed prompt or a voice note.' }, { status: 400 });
    }

    const userPrompt = prompt
      || 'Create the product draft from the attached voice note, which describes the product. Transcribe and use everything the speaker says.';

    const response = await generateStructuredGeminiJson<ProductDraftResponse>({
      schemaPrompt: `You are helping an African luxury fashion admin team create a product draft.
Return valid JSON only with this exact shape:
{
  "summary": string,
  "draft": {
    "name": string,
    "description": string,
    "longDescription": string,
    "category": string,
    "subcategory": string,
    "gender": string,
    "price": number,
    "compareAtPrice": number | null,
    "costPrice": number | null,
    "sizes": string,
    "colors": string,
    "materials": string,
    "totalStock": number,
    "tags": string,
    "isPublished": boolean,
    "isFeatured": boolean,
    "isNewArrival": boolean
  }
}
Rules:
- Use one of these categories only: ${Object.keys(categoryGuide).join(', ')}.
- Use a valid subcategory for the chosen category when possible: ${JSON.stringify(categoryGuide)}.
- Use one of these genders only: men, women, unisex, or empty string.
- Return sizes, colors, materials, and tags as JSON array strings like ["S","M"] or [].
- If price is unknown, estimate reasonably from the description and image context.
- Keep isPublished false by default unless the request clearly says ready to publish.
- Keep isFeatured false by default unless the request clearly says feature it.
- Keep isNewArrival true only if this is described as a new launch or new arrival.
- Make the summary a short plain-English explanation of what was inferred.`,
      userPrompt,
      images: Array.isArray(body.images) ? body.images : [],
      audio: body.audioBase64 && body.audioMimeType ? { data: body.audioBase64, mimeType: body.audioMimeType } : null,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('Product AI draft error:', error);
    const fallback = fallbackProductDraft(promptForFallback);
    return NextResponse.json({
      ...fallback,
      warning: getGeminiErrorMessage(error),
      source: 'template',
    });
  }
}