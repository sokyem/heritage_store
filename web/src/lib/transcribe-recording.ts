// Transcribe a JaaS cloud recording (a video/audio file) into text using the
// Gemini Files API. The browser Web Speech API can only hear the local mic, so
// a recording — which contains every participant — is the only reliable way to
// get a both-sides consultation transcript. Called best-effort from the JaaS
// recording webhook once a finished recording is delivered.

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execFileP = promisify(execFile);

const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

// Guard against loading an enormous recording fully into memory on a small
// Railway container. ~600MB comfortably covers a long HD consultation; beyond
// that we fail loudly rather than risk an OOM that takes down the server.
const MAX_RECORDING_BYTES = 600 * 1024 * 1024;

type GeminiFile = { name: string; uri: string; state: string; mimeType?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Strip a mono 16kHz MP3 audio track from a video recording using ffmpeg.
 * Transcribing audio is ~8x cheaper than video on Gemini and uploads far less.
 * Returns null on any failure (ffmpeg missing, bad input) so the caller falls
 * back to sending the original file unchanged.
 */
async function extractAudio(video: Buffer): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const id = `awulak-rec-${process.pid}-${Date.now()}`;
  const inPath = join(tmpdir(), `${id}.in`);
  const outPath = join(tmpdir(), `${id}.mp3`);
  try {
    await writeFile(inPath, video);
    await execFileP(
      'ffmpeg',
      ['-y', '-i', inPath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', outPath],
      { timeout: 5 * 60 * 1000 },
    );
    const bytes = await readFile(outPath);
    if (!bytes.length) return null;
    console.log(`[transcribe-recording] extracted ${bytes.length} bytes of audio from ${video.length} bytes of video`);
    return { bytes, mimeType: 'audio/mp3' };
  } catch (err) {
    console.warn('[transcribe-recording] ffmpeg audio extraction unavailable, sending original:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    unlink(inPath).catch(() => {});
    unlink(outPath).catch(() => {});
  }
}

/**
 * Download a recording from `url` and transcribe it via Gemini. Returns the
 * transcript text, or throws on any failure (the caller logs and moves on).
 */
export async function transcribeRecordingFromUrl(url: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  const model = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

  // 1. Download the recording into memory.
  const dl = await fetch(url);
  if (!dl.ok) throw new Error(`recording download failed: ${dl.status}`);
  const mimeType = dl.headers.get('content-type')?.split(';')[0] || 'video/mp4';
  // Reject oversized recordings up front via Content-Length when present.
  const declared = Number(dl.headers.get('content-length') || 0);
  if (declared > MAX_RECORDING_BYTES) {
    throw new Error(`recording too large to transcribe (${declared} bytes)`);
  }
  const bytes = Buffer.from(await dl.arrayBuffer());
  if (bytes.length === 0) throw new Error('recording is empty');
  if (bytes.length > MAX_RECORDING_BYTES) {
    throw new Error(`recording too large to transcribe (${bytes.length} bytes)`);
  }
  console.log(`[transcribe-recording] downloaded ${bytes.length} bytes (${mimeType})`);

  // 1b. Strip the audio track to cut Gemini cost ~8x. Falls back to the
  // original file when ffmpeg is unavailable or the input has no extractable
  // audio.
  const audio = await extractAudio(bytes);
  const uploadBytes = audio?.bytes ?? bytes;
  const uploadMime = audio?.mimeType ?? mimeType;

  // 2. Start a resumable upload to the Gemini Files API.
  const start = await fetch(`${GEMINI_BASE}/upload/v1beta/files?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(uploadBytes.length),
      'X-Goog-Upload-Header-Content-Type': uploadMime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'consultation-recording' } }),
  });
  if (!start.ok) throw new Error(`files start failed: ${start.status} ${await start.text()}`);
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('files start returned no upload URL');

  // 3. Upload the bytes and finalize in one request.
  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(uploadBytes.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    // Node's fetch (undici) accepts a Buffer body directly; the DOM BodyInit
    // type doesn't list it, so cast. Zero-copy — important for large uploads.
    body: uploadBytes as unknown as BodyInit,
  });
  if (!up.ok) throw new Error(`files upload failed: ${up.status} ${await up.text()}`);
  let file = (await up.json()).file as GeminiFile;

  // 4. Video/audio is processed async — poll until ACTIVE (up to ~4 min).
  for (let i = 0; file.state === 'PROCESSING' && i < 48; i++) {
    await sleep(5000);
    const poll = await fetch(`${GEMINI_BASE}/v1beta/${file.name}?key=${apiKey}`);
    if (!poll.ok) throw new Error(`files poll failed: ${poll.status}`);
    file = (await poll.json()) as GeminiFile;
  }
  if (file.state !== 'ACTIVE') throw new Error(`file not processable (state ${file.state})`);

  // 5. Ask Gemini to transcribe, labelling speakers where possible.
  const prompt =
    'Transcribe this consultation recording verbatim in English. It is a call ' +
    'between a fashion-atelier designer and a client. Label each turn as ' +
    '"Designer:" or "Client:" when the speakers are distinguishable; otherwise ' +
    'use "Speaker 1:" / "Speaker 2:". Preserve names, garment terms, and numbers ' +
    'exactly. Return only the plain-text transcript with no preamble.';

  const gen = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }, { fileData: { mimeType: file.mimeType || mimeType, fileUri: file.uri } }],
        },
      ],
      generationConfig: { temperature: 0.1 },
    }),
    cache: 'no-store',
  });
  if (!gen.ok) throw new Error(`transcription generate failed: ${gen.status} ${await gen.text()}`);
  const data = await gen.json();
  const text: string = (data.candidates?.[0]?.content?.parts || [])
    .map((p: { text?: string }) => p.text || '')
    .join('')
    .trim();

  // 6. Best-effort cleanup of the uploaded file (ignore failures).
  fetch(`${GEMINI_BASE}/v1beta/${file.name}?key=${apiKey}`, { method: 'DELETE' }).catch(() => {});

  if (!text) throw new Error('transcription returned empty text');
  return text;
}
