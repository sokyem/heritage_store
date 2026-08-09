import { NextRequest, NextResponse } from 'next/server';
import { getGeminiErrorMessage } from '@/lib/gemini-structured';
import { summarizeConsultation } from '@/lib/summarize';

// POST /api/transcribe/summarize
// Produce a concise, structured consultation summary from the call transcript
// and/or the admin's raw notes using Gemini. Used by the post-call screen and
// the admin consultation page to drop a clean summary into the record.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, notes } = body as { transcript?: string; notes?: string };

    if (!transcript?.trim() && !notes?.trim()) {
      return NextResponse.json(
        { error: 'There is no transcript or notes to summarize yet.' },
        { status: 400 },
      );
    }

    const summary = await summarizeConsultation({ transcript, notes });
    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Summary failed:', error);
    return NextResponse.json({ error: getGeminiErrorMessage(error) }, { status: 502 });
  }
}
