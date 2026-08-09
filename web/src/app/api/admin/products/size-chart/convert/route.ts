import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { generateStructuredGeminiJson, getGeminiErrorMessage } from '@/lib/gemini-structured';

/**
 * POST /api/admin/products/size-chart/convert
 *
 * Reads a measurement/size chart image (Cloudinary URL or a base64 data URL)
 * and returns a structured table with EVERY measurement expressed in BOTH
 * centimetres and inches, regardless of the chart's original unit. The result
 * is saved on the product as `sizeChartData` so the storefront can toggle units.
 */

type SizeChartCell = { cm: number | null; in: number | null };
type SizeChartRow = { size: string; values: Record<string, SizeChartCell> };
type SizeChartResult = {
  unitDetected: 'cm' | 'in' | 'mixed' | 'unknown';
  columns: string[];
  rows: SizeChartRow[];
  notes: string;
};

function fallbackSizeChartResult(): SizeChartResult {
  return {
    unitDetected: 'unknown',
    columns: [],
    rows: [],
    notes: 'AI conversion unavailable. Add rows manually or retry conversion.',
  };
}

// Turn an https image URL into the `data:<mime>;base64,...` form the Gemini
// helper expects. A data URL is passed straight through.
async function toDataUrl(image: string): Promise<string> {
  if (image.startsWith('data:')) return image;
  const res = await fetch(image, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not fetch chart image (${res.status})`);
  const mime = res.headers.get('content-type') || 'image/jpeg';
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const image = typeof body.image === 'string' ? body.image.trim() : '';
    if (!image) {
      return NextResponse.json({ error: 'Provide a size-chart image (URL or data URL).' }, { status: 400 });
    }

    let dataUrl: string;
    try {
      dataUrl = await toDataUrl(image);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Could not load the chart image.' },
        { status: 400 },
      );
    }

    const result = await generateStructuredGeminiJson<SizeChartResult>({
      schemaPrompt: `You are converting a clothing size/measurement chart from an image into structured data.
Read the chart in the attached image carefully. Return valid JSON ONLY with this exact shape:
{
  "unitDetected": "cm" | "in" | "mixed" | "unknown",
  "columns": string[],
  "rows": [ { "size": string, "values": { "<column name>": { "cm": number|null, "in": number|null } } } ],
  "notes": string
}
Rules:
- "columns" is the list of measurement column headers exactly as they appear (e.g. "Cloth Length", "Bust", "Pants Length", "Chest", "Recommended Height"). Do NOT include the size column itself.
- For every cell, provide BOTH "cm" and "in" no matter the chart's original unit. Convert: inches = cm / 2.54, cm = inches * 2.54. Round to 1 decimal place.
- If a cell is a range (e.g. "40 - 44"), use the midpoint for the numeric value.
- If a value is non-numeric or absent, use null for both cm and in.
- "unitDetected" is the unit the chart was originally drawn in.
- Keep "size" labels exactly as shown (S, M, L, XL, 2XL, Medium, etc.).
- "notes" is a short plain-English note (e.g. measurement basis, any uncertainty). Keep it under 200 chars.`,
      userPrompt: 'Convert the attached size chart into the JSON structure above with both cm and inch values.',
      images: [dataUrl],
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[size-chart/convert]', error);
    return NextResponse.json({
      ...fallbackSizeChartResult(),
      warning: getGeminiErrorMessage(error),
      source: 'template',
    });
  }
}
