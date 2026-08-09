import { generateStructuredGeminiJson } from '@/lib/gemini-structured';

// Shared consultation-summary logic so the post-call screen, the admin page,
// and the auto-summary step in the recording webhook all produce the same
// structured summary from a transcript and/or notes.
export async function summarizeConsultation({
  transcript,
  notes,
}: {
  transcript?: string | null;
  notes?: string | null;
}): Promise<string> {
  const source = [
    transcript?.trim() ? `TRANSCRIPT:\n${transcript.trim()}` : '',
    notes?.trim() ? `RAW NOTES:\n${notes.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!source) return '';

  const result = await generateStructuredGeminiJson<{ summary: string }>({
    schemaPrompt:
      `You are an assistant to a luxury fashion atelier summarizing a client ` +
      `design consultation. From the transcript and/or notes provided, write a concise, ` +
      `well-structured summary the designer can save to the client's record. Use these ` +
      `markdown sections, omitting any that have no content:\n` +
      `**Summary** — 1-2 sentences on what the consultation covered.\n` +
      `**Key points** — bulleted client preferences, style direction, garments, fabrics, measurements.\n` +
      `**Decisions** — bulleted decisions made.\n` +
      `**Follow-ups** — bulleted action items / next steps.\n` +
      `Preserve names, garment terms, and numbers exactly. Be faithful to the source — ` +
      `do not invent details. Respond ONLY with JSON of the form ` +
      `{ "summary": "<the markdown summary>" }.`,
    userPrompt: source,
  });

  return result.summary || '';
}
