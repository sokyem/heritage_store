import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

interface AnalysisResult {
  styleSummary: string;
  fabricSuggestions: string;
  designNotes: string;
  aiRecommendations: {
    silhouettes: string[];
    accessories: string[];
    pricingGuidance: string;
    moodDescription: string;
  };
}

function describeInspiration(inspiration?: string | null): string {
  if (!inspiration) {
    return 'Not specified';
  }

  try {
    const parsed = JSON.parse(inspiration) as {
      notes?: string;
      uploads?: Array<{ name?: string; sizeLabel?: string }>;
    };

    const notes = parsed.notes?.trim();
    const uploads = parsed.uploads ?? [];
    const uploadNames = uploads.map((upload) => upload.name).filter(Boolean);

    const parts = [notes];
    if (uploadNames.length) {
      parts.push(`Uploaded inspiration images: ${uploadNames.join(', ')}.`);
      parts.push('Visual references are attached for studio review even if image pixels are not directly analyzed here.');
    }

    return parts.filter(Boolean).join(' ');
  } catch {
    return inspiration;
  }
}

function getMockAnalysis(consultation: {
  eventType?: string | null;
  budget?: string | null;
  stylePreferences?: string | null;
  bodyType?: string | null;
  colors?: string | null;
}): AnalysisResult {
  const eventLabel = consultation.eventType || 'special occasion';
  const budgetLabel = consultation.budget || 'flexible';
  const styleLabel = consultation.stylePreferences || 'elegant and timeless';
  const colorLabel = consultation.colors || 'classic neutrals';

  return {
    styleSummary: `Based on your preferences for a ${eventLabel} event, we envision a ${styleLabel} aesthetic that celebrates your unique beauty. The overall direction leans toward sophisticated silhouettes with thoughtful detailing that reflects both modern luxury and timeless craftsmanship.`,
    fabricSuggestions: `For your vision, we recommend premium fabrics such as silk charmeuse for drape and movement, French lace for delicate embellishment, and Italian crepe for structured elegance. Given your color preferences of ${colorLabel}, these fabrics will be sourced in complementary tones to create depth and visual interest.`,
    designNotes: `Key design considerations: Focus on flattering construction with attention to ${consultation.bodyType || 'comfortable fit'}. Custom pattern-making will ensure a perfect silhouette. We suggest incorporating subtle hand-finished details that elevate the piece from beautiful to extraordinary. Timeline recommendation: 6-8 weeks for custom creation.`,
    aiRecommendations: {
      silhouettes: [
        'A-line with structured bodice',
        'Column dress with side draping',
        'Fitted sheath with architectural details',
      ],
      accessories: [
        'Statement earrings in complementary tones',
        'Delicate layered bracelet',
        'Custom-dyed silk clutch',
      ],
      pricingGuidance: `Based on your ${budgetLabel} investment range, we can create a stunning custom piece with premium fabrics and hand-finished details. The consultation will refine exact specifications and final pricing.`,
      moodDescription: `Refined luxury meets personal expression — a piece that commands attention through impeccable craftsmanship and thoughtful design.`,
    },
  };
}

function buildPrompt(consultation: {
  eventType?: string | null;
  eventDate?: string | null;
  budget?: string | null;
  stylePreferences?: string | null;
  bodyType?: string | null;
  colors?: string | null;
  inspiration?: string | null;
  specialNotes?: string | null;
}): string {
  return `You are a luxury fashion consultant for AWULA_K, an exclusive custom fashion house specializing in bespoke garments. Analyze the following client intake data and provide personalized recommendations.

CLIENT INTAKE DATA:
- Event Type: ${consultation.eventType || 'Not specified'}
- Event Date: ${consultation.eventDate || 'Not specified'}
- Budget Range: ${consultation.budget || 'Not specified'}
- Style Preferences: ${consultation.stylePreferences || 'Not specified'}
- Body Type & Fit Goals: ${consultation.bodyType || 'Not specified'}
- Preferred Colors: ${consultation.colors || 'Not specified'}
- Inspiration: ${describeInspiration(consultation.inspiration)}
- Special Notes: ${consultation.specialNotes || 'Not specified'}

Provide your analysis as a JSON object with exactly this structure (no markdown, no code fences, just raw JSON):
{
  "styleSummary": "A 2-3 sentence personalized style summary describing the overall aesthetic direction and how it suits the client",
  "fabricSuggestions": "A detailed paragraph recommending specific luxury fabrics (silk, lace, crepe, etc.) with reasoning based on the event, style, and color preferences",
  "designNotes": "A detailed paragraph with design considerations including silhouette recommendations, construction details, timeline, and any special accommodations noted by the client",
  "aiRecommendations": {
    "silhouettes": ["3 specific silhouette recommendations"],
    "accessories": ["3 accessory suggestions that complement the look"],
    "pricingGuidance": "A sentence about pricing expectations based on the budget range and design complexity",
    "moodDescription": "A short evocative sentence capturing the overall mood of the envisioned look"
  }
}

Be specific, luxurious in tone, and personalized to this client's needs. Reference their specific preferences in your recommendations.`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { consultationId } = body;

    if (!consultationId) {
      return NextResponse.json(
        { error: 'consultationId is required' },
        { status: 400 }
      );
    }

    // Fetch the consultation
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation) {
      return NextResponse.json(
        { error: 'Consultation not found' },
        { status: 404 }
      );
    }

    // Mark as analyzing
    await prisma.consultation.update({
      where: { id: consultationId },
      data: { analysisStatus: 'analyzing' },
    });

    let analysis: AnalysisResult;

    // Try Claude API, fall back to mock if no API key
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        });

        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          messages: [
            {
              role: 'user',
              content: buildPrompt(consultation),
            },
          ],
        });

        const textContent = message.content.find((block) => block.type === 'text');
        if (!textContent || textContent.type !== 'text') {
          throw new Error('No text response from Claude');
        }

        analysis = JSON.parse(textContent.text) as AnalysisResult;
      } catch (aiError) {
        console.error('Claude API error, falling back to mock analysis:', aiError);
        analysis = getMockAnalysis(consultation);
      }
    } else {
      console.log('No ANTHROPIC_API_KEY configured, using mock analysis');
      analysis = getMockAnalysis(consultation);
    }

    // Save analysis results
    const updated = await prisma.consultation.update({
      where: { id: consultationId },
      data: {
        analysisStatus: 'completed',
        styleSummary: analysis.styleSummary,
        fabricSuggestions: analysis.fabricSuggestions,
        designNotes: analysis.designNotes,
        aiRecommendations: JSON.stringify(analysis.aiRecommendations),
      },
      include: { user: true },
    });

    return NextResponse.json({
      consultation: updated,
      analysis,
    });
  } catch (error) {
    console.error('Analysis failed:', error);

    // Try to mark as failed
    try {
      const body = await request.json().catch(() => ({}));
      if (body && typeof body === 'object' && 'consultationId' in body) {
        await prisma.consultation.update({
          where: { id: (body as { consultationId: string }).consultationId },
          data: { analysisStatus: 'failed' },
        });
      }
    } catch {
      // ignore update failure
    }

    return NextResponse.json(
      { error: 'Analysis failed. Please try again.' },
      { status: 500 }
    );
  }
}
