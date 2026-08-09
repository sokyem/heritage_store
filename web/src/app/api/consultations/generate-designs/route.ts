import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

interface DesignResult {
  url: string;
  label: string;
}

interface UploadedReference {
  name?: string;
  dataUrl?: string;
  sizeLabel?: string;
}

interface InspirationContext {
  notes: string;
  uploads: UploadedReference[];
  bodyReferencePhotos: UploadedReference[];
}

interface AnthropicImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

type DesignSource = 'ai' | 'fallback';

const togetherImageModels = (process.env.TOGETHER_IMAGE_MODELS || '')
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);

const defaultTogetherImageModels = [
  'black-forest-labs/FLUX.1-schnell',
  'black-forest-labs/FLUX.1-dev',
  'stabilityai/stable-diffusion-xl-base-1.0',
  'black-forest-labs/FLUX.1-schnell-Free',
];

/**
 * Build a rich image-generation prompt from consultation data.
 */
function parseInspirationContext(inspiration?: string | null): InspirationContext {
  if (!inspiration) {
    return { notes: '', uploads: [], bodyReferencePhotos: [] };
  }

  try {
    const parsed = JSON.parse(inspiration) as {
      notes?: string;
      uploads?: UploadedReference[];
      bodyReferencePhotos?: UploadedReference[];
    };

    return {
      notes: parsed.notes?.trim() || '',
      uploads: Array.isArray(parsed.uploads) ? parsed.uploads : [],
      bodyReferencePhotos: Array.isArray(parsed.bodyReferencePhotos) ? parsed.bodyReferencePhotos : [],
    };
  } catch {
    return { notes: inspiration, uploads: [], bodyReferencePhotos: [] };
  }
}

function parseDataUrl(dataUrl?: string) {
  if (!dataUrl) return null;

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mediaType: match[1],
    data: match[2],
  };
}

async function summarizeReferencePhotos(references: UploadedReference[]): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || references.length === 0) {
    return null;
  }

  const imageBlocks = references
    .slice(0, 2)
    .map((reference) => parseDataUrl(reference.dataUrl))
    .filter((reference): reference is { mediaType: string; data: string } => Boolean(reference))
    .map((reference) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: reference.mediaType,
        data: reference.data,
      },
    })) as AnthropicImageBlock[];

  if (imageBlocks.length === 0) {
    return null;
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Summarize the visible person in these body or face reference photos for a fashion image-generation prompt. Focus only on physical traits useful for faithful styling: skin tone, facial structure, hairstyle, approximate age range, body proportions, and overall presence. Keep it to 2 concise sentences. Do not identify the person.',
            },
            ...(imageBlocks as any[]),
          ],
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    return textBlock && textBlock.type === 'text' ? textBlock.text.trim() : null;
  } catch (error) {
    console.error('Reference photo analysis failed:', error);
    return null;
  }
}

async function summarizeInspirationDesigns(references: UploadedReference[]): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || references.length === 0) {
    return null;
  }

  const imageBlocks = references
    .slice(0, 3)
    .map((reference) => parseDataUrl(reference.dataUrl))
    .filter((reference): reference is { mediaType: string; data: string } => Boolean(reference))
    .map((reference) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: reference.mediaType,
        data: reference.data,
      },
    })) as AnthropicImageBlock[];

  if (imageBlocks.length === 0) {
    return null;
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 350,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Summarize the garment design direction shown in these inspiration images for a couture image-generation prompt. Focus on silhouette, neckline, sleeves, drape, fabric mood, color story, embellishment placement, and overall styling direction. Ignore the model ethnicity, face, and body. Keep it to 3 concise sentences.',
            },
            ...(imageBlocks as any[]),
          ],
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    return textBlock && textBlock.type === 'text' ? textBlock.text.trim() : null;
  } catch (error) {
    console.error('Inspiration image analysis failed:', error);
    return null;
  }
}

/**
 * Analyze inspiration images and body reference photos directly with Gemini vision.
 * Returns a combined analysis string that Gemini has already seen, enabling the
 * image-generation model to faithfully reproduce the actual visual content.
 */
async function analyzeInspirationImagesWithGemini(
  inspirationUploads: UploadedReference[],
  bodyReferencePhotos: UploadedReference[],
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const allImages = [
    ...inspirationUploads.slice(0, 3),
    ...bodyReferencePhotos.slice(0, 2),
  ];

  if (allImages.length === 0) return null;

  // Build inline image parts for the Gemini API request
  const imageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  for (const upload of allImages) {
    const parsed = parseDataUrl(upload.dataUrl);
    if (parsed) {
      imageParts.push({
        inlineData: {
          mimeType: parsed.mediaType,
          data: parsed.data,
        },
      });
    }
  }

  if (imageParts.length === 0) return null;

  const hasInspirationImages = inspirationUploads.length > 0;
  const hasBodyPhotos = bodyReferencePhotos.length > 0;

  let analysisPrompt = 'You are analyzing images to guide couture fashion design generation. ';

  if (hasInspirationImages && hasBodyPhotos) {
    analysisPrompt +=
      `The first ${Math.min(inspirationUploads.length, 3)} image(s) are garment inspiration references; ` +
      `the remaining ${Math.min(bodyReferencePhotos.length, 2)} image(s) are body or face reference photos of the client. ` +
      'Provide two clearly labelled sections:\n\n' +
      'GARMENT DIRECTION: Describe the silhouette, neckline, sleeve style, drape, fabric mood, color story, embellishment placement, and overall styling direction shown in the inspiration images. Be specific and visual — 3–4 sentences.\n\n' +
      'CLIENT REFERENCE: Describe the visible physical traits of the person in the body/face reference photos that are relevant for faithful styling: skin tone, facial structure, hairstyle, approximate age range, body proportions, and overall presence. 2 sentences. Do not identify the person.';
  } else if (hasInspirationImages) {
    analysisPrompt +=
      `Analyze the ${Math.min(inspirationUploads.length, 3)} garment inspiration image(s). ` +
      'Describe the silhouette, neckline, sleeve style, drape, fabric mood, color story, embellishment placement, and overall styling direction. Be specific and visual — 3–4 sentences.';
  } else {
    analysisPrompt +=
      `Analyze the ${Math.min(bodyReferencePhotos.length, 2)} body or face reference photo(s) of the client. ` +
      'Describe the visible physical traits relevant for faithful styling: skin tone, facial structure, hairstyle, approximate age range, body proportions, and overall presence. 2 sentences. Do not identify the person.';
  }

  const model = 'gemini-2.0-flash';

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: analysisPrompt },
                ...imageParts,
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 512,
          },
        }),
      },
    );

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`Gemini vision analysis error (model=${model}):`, res.status, errorBody);
      return null;
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) return null;

    const textPart = parts.find((p: { text?: string }) => typeof p.text === 'string');
    if (!textPart?.text) return null;

    console.log(`[generate-designs] Gemini vision analysis succeeded (model=${model}, images=${imageParts.length})`);
    return textPart.text.trim();
  } catch (err) {
    console.error('Gemini vision analysis request failed:', err);
    return null;
  }
}

function buildImagePrompt(consultation: {
  eventType?: string | null;
  stylePreferences?: string | null;
  bodyType?: string | null;
  colors?: string | null;
  inspiration?: string | null;
  specialNotes?: string | null;
}, variant: 'front' | 'side' | 'detail', referenceSummary?: string | null, designSummary?: string | null, geminiVisionAnalysis?: string | null): string {
  const event = consultation.eventType || 'special occasion';
  const style = consultation.stylePreferences || 'elegant, modern';
  const colors = consultation.colors || 'rich jewel tones';
  const bodyInfo = consultation.bodyType || '';
  const inspirationContext = parseInspirationContext(consultation.inspiration);

  // Extract body profile if present
  const bodyProfile = bodyInfo.match(/Selected body profile: (\w+)/)?.[1] || '';
  const fitGoals = bodyInfo.replace(/Selected body profile:.*?\n?/, '').replace(/Body reference photos uploaded:.*/, '').trim();

  const subjectDescription = referenceSummary
    ? `photorealistic editorial image of the same Black woman shown in the uploaded body or face reference photos, matching her facial features, skin tone, hair, and overall presence`
    : 'photorealistic editorial image of a real Black woman with deep melanin-rich skin, African features, natural human proportions, and believable studio portrait realism';

  const basePrompt = `${subjectDescription}, wearing a luxury couture ${event} gown with a ${style} aesthetic in a ${colors} color palette`;

  const bodyDesc = bodyProfile
    ? `on a ${bodyProfile} body type${fitGoals ? `, ${fitGoals}` : ''}`
    : fitGoals ? `with fit emphasis: ${fitGoals}` : '';

  // Parse inspiration notes
  let inspirationDesc = '';
  if (inspirationContext.notes) {
    inspirationDesc = `, inspired by: ${inspirationContext.notes}`;
  } else if (consultation.inspiration) {
    inspirationDesc = `, inspired by: ${consultation.inspiration}`;
  }

  // Gemini vision analysis takes priority — it reflects what the model actually saw in the images.
  // Fall back to Claude text summaries if vision analysis was not available.
  let referenceDesc: string;
  let designDesc: string;

  if (geminiVisionAnalysis) {
    referenceDesc = '';
    designDesc = `, Gemini has directly analyzed the uploaded inspiration and reference images and produced the following visual analysis — use it as the primary design direction: ${geminiVisionAnalysis}`;
  } else {
    referenceDesc = referenceSummary ? `, preserve these reference traits: ${referenceSummary}` : '';
    designDesc = designSummary
      ? `, use the uploaded inspiration images as the primary garment direction: ${designSummary}`
      : ', use the uploaded inspiration as the primary source for the gown design rather than inventing unrelated styling';
  }

  const specialNotesDesc = consultation.specialNotes ? `, special considerations: ${consultation.specialNotes}` : '';

  const viewMap = {
    front: 'front view, full length, standing pose, luxury fashion editorial photography, realistic studio lighting',
    side: 'three-quarter angle view, showing drape and silhouette, realistic editorial lighting, natural body posture',
    detail: 'close-up detail of the gown on a real human wearer, fabric texture, embellishment, and craftsmanship, premium fashion photography',
  };

  return `${basePrompt} ${bodyDesc}${inspirationDesc}${designDesc}${referenceDesc}${specialNotesDesc}, ${viewMap[variant]}. Preserve the silhouette, neckline, embellishment language, drape, and color story from the inspiration images. Do not copy the identity of any model shown in the inspiration images. Do not switch to a white or light-skinned model unless the uploaded body or face reference explicitly shows that person. Photorealistic human skin texture, natural face, realistic hands, luxury couture campaign image, high detail, elegant composition. Not an illustration, not a sketch, not watercolor, not anime, not doll-like. No text, no watermark.`;
}

/**
 * Truncate a prompt to stay within Gemini's 32,768-token limit.
 * Uses a conservative 4 chars-per-token estimate and targets ~20,000 tokens
 * to leave a comfortable buffer for system overhead and response tokens.
 */
function truncatePromptForGemini(prompt: string): string {
  const MAX_SAFE_TOKENS = 20_000;
  const CHARS_PER_TOKEN = 4;
  const maxChars = MAX_SAFE_TOKENS * CHARS_PER_TOKEN;

  if (prompt.length <= maxChars) {
    return prompt;
  }

  // Preserve the beginning of the prompt (most important context) and signal truncation
  const truncated = prompt.slice(0, maxChars);
  console.warn(
    `Gemini prompt truncated: original ${prompt.length} chars → ${truncated.length} chars ` +
    `(~${Math.ceil(prompt.length / CHARS_PER_TOKEN)} tokens exceeded ${MAX_SAFE_TOKENS}-token safe limit)`
  );
  return truncated + ' [truncated]';
}

/**
 * Generate design image using Gemini Imagen API.
 */
async function generateWithGemini(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

  // Truncate prompt to avoid exceeding Gemini's 32,768-token input limit
  const safePrompt = truncatePromptForGemini(prompt);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: safePrompt }],
            },
          ],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
            imageConfig: {
              aspectRatio: '3:4',
            },
          },
        }),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`Gemini Imagen error (model=${model}):`, res.status, errorBody);
      return null;
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) return null;

    // Find image part in response
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        // Convert base64 to data URL
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }

    return null;
  } catch (err) {
    console.error('Gemini Imagen request failed:', err);
    return null;
  }
}

/**
 * Generate design concepts using Together AI (FLUX model) or fallback to curated mockups.
 */
async function generateWithTogetherAI(prompt: string, hasBodyReference: boolean): Promise<string | null> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) return null;

  const modelsToTry = togetherImageModels.length > 0
    ? togetherImageModels
    : defaultTogetherImageModels;

  for (const model of modelsToTry) {
    try {
      const res = await fetch('https://api.together.xyz/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          negative_prompt: hasBodyReference
            ? 'illustration, sketch, watercolor, anime, doll, plastic skin, deformed hands, extra fingers, synthetic face, low detail'
            : 'white woman, pale skin, caucasian, european features, blonde model, illustration, sketch, watercolor, anime, doll, plastic skin, deformed hands, extra fingers, synthetic face, low detail',
          width: 768,
          height: 1024,
          steps: 8,
          n: 1,
          response_format: 'url',
        }),
      });

      if (!res.ok) {
        console.error(`Together AI error for ${model}:`, res.status, await res.text());
        continue;
      }

      const data = await res.json();
      const url = data.data?.[0]?.url;
      if (url) {
        return url;
      }
    } catch (err) {
      console.error(`Together AI request failed for ${model}:`, err);
    }
  }

  return null;
}

/**
 * Try image generation providers in order: Gemini → Together AI → fallback
 */
async function generateImage(prompt: string, hasBodyReference: boolean): Promise<string | null> {
  // Try Gemini first (free tier, good quality)
  const geminiResult = await generateWithGemini(prompt);
  if (geminiResult) return geminiResult;

  // Fall back to Together AI
  const togetherResult = await generateWithTogetherAI(prompt, hasBodyReference);
  if (togetherResult) return togetherResult;

  return null;
}

/**
 * Create curated mockup designs from existing product photography
 * when no image generation API is available.
 */
function getMockDesigns(consultation: {
  eventType?: string | null;
  stylePreferences?: string | null;
  colors?: string | null;
  bodyType?: string | null;
}): DesignResult[] {
  const event = (consultation.eventType || '').toLowerCase();
  const style = (consultation.stylePreferences || '').toLowerCase();
  const colors = (consultation.colors || '').toLowerCase();

  // Map to existing product images based on consultation preferences
  const designs: DesignResult[] = [];

  // Determine primary silhouette based on event + style
  if (event.includes('wedding') || event.includes('bridal') || style.includes('bridal')) {
    designs.push(
      { url: '/media/bridal-veil-portrait.jpg', label: 'Bridal Silhouette — Ethereal Veil Gown' },
      { url: '/media/bridal-beaded-full.jpg', label: 'Beaded Ceremonial — Hand-Embellished Bodice' },
      { url: '/media/silver-sequin-flow.jpg', label: 'Reception Look — Flowing Silver Sequin' },
    );
  } else if (event.includes('prom') || event.includes('gala') || event.includes('formal')) {
    designs.push(
      { url: '/media/orange-mermaid-full.jpg', label: 'Mermaid Silhouette — Dramatic Floor-Length' },
      { url: '/media/orange-corset-pose.jpg', label: 'Corset Bodice — Sculptural Construction' },
      { url: '/media/silver-sequin-pose.jpg', label: 'Statement Gown — Sequin-Embellished Drape' },
    );
  } else if (event.includes('party') || event.includes('cocktail') || style.includes('modern')) {
    designs.push(
      { url: '/media/silver-sequin-drape.jpg', label: 'Modern Evening — Asymmetric Drape' },
      { url: '/media/IMG_8376.jpg', label: 'Contemporary Couture — Structured Silhouette' },
      { url: '/media/orange-corset-closeup.jpg', label: 'Detail Focus — Artisan Embellishment' },
    );
  } else {
    // Default elegant selection
    designs.push(
      { url: '/media/orange-mermaid-piano.jpg', label: 'Elegant Silhouette — Curvature & Grace' },
      { url: '/media/silver-sequin-seated.jpg', label: 'Seated Drape — How the Fabric Moves' },
      { url: '/media/bridal-beaded-full.jpg', label: 'Embellished Bodice — Artisan Beadwork' },
    );
  }

  // Add color-matched options
  if (colors.includes('gold') || colors.includes('orange') || colors.includes('warm')) {
    designs.push({ url: '/media/IMG_7454.jpg', label: 'Warm Tone Reference — Golden Hour Palette' });
  } else if (colors.includes('silver') || colors.includes('grey') || colors.includes('cool')) {
    designs.push({ url: '/media/silver-sequin-toast.jpg', label: 'Cool Tone Reference — Platinum Shimmer' });
  } else {
    designs.push({ url: '/media/IMG_8381.jpg', label: 'Fabric & Color Mood Board' });
  }

  return designs;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { consultationId } = body;

    if (!consultationId) {
      return NextResponse.json({ error: 'consultationId is required' }, { status: 400 });
    }

    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation) {
      return NextResponse.json({ error: 'Consultation not found' }, { status: 404 });
    }

    const designs: DesignResult[] = [];
    let source: DesignSource = 'fallback';
    let message = 'Showing curated studio references while AI image generation is unavailable.';

    // Try AI-generated images (Gemini or Together AI)
    const hasImageProvider = process.env.GEMINI_API_KEY || process.env.TOGETHER_API_KEY;
    if (hasImageProvider) {
      const inspirationContext = parseInspirationContext(consultation.inspiration);
      const bodyReferencePhotos = inspirationContext.bodyReferencePhotos;

      // Attempt Gemini vision analysis first — Gemini directly sees the uploaded images,
      // producing a richer and more faithful design direction than a text-only description.
      let geminiVisionAnalysis: string | null = null;
      let referenceSummary: string | null = null;
      let designSummary: string | null = null;

      const hasAnyImages = inspirationContext.uploads.length > 0 || bodyReferencePhotos.length > 0;
      if (hasAnyImages && process.env.GEMINI_API_KEY) {
        console.log('[generate-designs] Attempting Gemini vision analysis for inspiration images...');
        geminiVisionAnalysis = await analyzeInspirationImagesWithGemini(
          inspirationContext.uploads,
          bodyReferencePhotos,
        );
      }

      if (!geminiVisionAnalysis) {
        // Fall back to Claude text summaries if Gemini vision analysis failed or was unavailable
        console.log('[generate-designs] Gemini vision unavailable — falling back to Claude text analysis');
        [referenceSummary, designSummary] = await Promise.all([
          summarizeReferencePhotos(bodyReferencePhotos),
          summarizeInspirationDesigns(inspirationContext.uploads),
        ]);
      }

      const variants: Array<{ variant: 'front' | 'side' | 'detail'; label: string }> = [
        { variant: 'front', label: 'Design Concept — Front View' },
        { variant: 'side', label: 'Design Concept — Silhouette View' },
        { variant: 'detail', label: 'Design Concept — Detail & Texture' },
      ];

      // Generate images in parallel
      const results = await Promise.allSettled(
        variants.map(async ({ variant, label }) => {
          const prompt = buildImagePrompt(consultation, variant, referenceSummary, designSummary, geminiVisionAnalysis);
          const url = await generateImage(prompt, bodyReferencePhotos.length > 0);
          return url ? { url, label } : null;
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          designs.push(result.value);
        }
      }

      if (designs.length > 0) {
        source = 'ai';
        message = 'AI-generated design concepts are ready.';
      } else {
        message = 'AI image generation did not return any renders, so curated studio references are shown instead.';
      }
    }

    // Fall back to curated mockups if no AI images generated
    if (designs.length === 0) {
      designs.push(...getMockDesigns(consultation));
    }

    return NextResponse.json({
      designs,
      source,
      message,
      aiEnabled: Boolean(process.env.GEMINI_API_KEY || process.env.TOGETHER_API_KEY),
    });
  } catch (error) {
    console.error('Generate designs error:', error);
    return NextResponse.json({ error: 'Failed to generate designs' }, { status: 500 });
  }
}
