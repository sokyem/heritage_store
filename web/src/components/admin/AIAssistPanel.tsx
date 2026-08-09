'use client';

import { useMemo, useRef, useState } from 'react';

type UploadedAsset = {
  id: string;
  name: string;
  dataUrl: string;
  sizeLabel: string;
};

type AIAssistResponse<TDraft> = {
  summary: string;
  draft: TDraft;
};

type AIAssistPanelProps<TDraft> = {
  title: string;
  helperText: string;
  endpoint: string;
  promptPlaceholder: string;
  extraPayload?: Record<string, unknown>;
  onApply: (draft: TDraft, assets: { images: string[] }) => void;
};

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const match = result.match(/^data:.+;base64,(.+)$/);
      if (!match) {
        reject(new Error('Could not encode audio recording.'));
        return;
      }
      resolve(match[1]);
    };
    reader.onerror = () => reject(new Error('Could not read audio recording.'));
    reader.readAsDataURL(blob);
  });
}

function fileToDataUrl(file: File) {
  return new Promise<UploadedAsset>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        dataUrl: String(reader.result),
        sizeLabel: formatFileSize(file.size),
      });
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export default function AIAssistPanel<TDraft>({
  title,
  helperText,
  endpoint,
  promptPlaceholder,
  extraPayload,
  onApply,
}: AIAssistPanelProps<TDraft>) {
  const [prompt, setPrompt] = useState('');
  const [imageUploads, setImageUploads] = useState<UploadedAsset[]>([]);
  const [recordingLabel, setRecordingLabel] = useState('');
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<AIAssistResponse<TDraft> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const voiceSupported = useMemo(
    () => typeof window !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined',
    [],
  );

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    const invalid = files.find((file) => !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024);
    if (invalid) {
      setError('Images must be under 5 MB and use an image file type.');
      return;
    }

    try {
      const uploads = await Promise.all(files.map((file) => fileToDataUrl(file)));
      setImageUploads((current) => [...current, ...uploads].slice(0, 4));
      setError('');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload images.');
    }
  }

  function removeImage(id: string) {
    setImageUploads((current) => current.filter((image) => image.id !== id));
  }

  async function startRecording() {
    if (!voiceSupported || isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || mimeType });
        stream.getTracks().forEach((track) => track.stop());

        try {
          const encoded = await blobToBase64(blob);
          setAudioBase64(encoded);
          setAudioMimeType(blob.type || mimeType);
          setRecordingLabel(`Voice note attached (${formatFileSize(blob.size)})`);
        } catch (recordError) {
          setError(recordError instanceof Error ? recordError.message : 'Could not attach voice note.');
        }
      };

      recorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingLabel('Recording...');
      setError('');
    } catch (micError) {
      // Surface the real reason so mic problems are diagnosable.
      const name = micError instanceof Error ? micError.name : '';
      const msg =
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone permission was denied. Allow mic access for this site in your browser, then try again.'
          : name === 'NotFoundError' || name === 'DevicesNotFoundError'
            ? 'No microphone was found. Connect one and try again.'
            : !window.isSecureContext
              ? 'Microphone needs a secure (https) connection.'
              : `Microphone unavailable${name ? ` (${name})` : ''}.`;
      setError(msg);
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
  }

  function clearVoiceNote() {
    setAudioBase64(null);
    setAudioMimeType(null);
    setRecordingLabel('');
  }

  async function generateDraft() {
    if (!prompt.trim() && !audioBase64) {
      setError('Add typed requirements or a voice note before generating a draft.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          images: imageUploads.map((image) => image.dataUrl),
          audioBase64,
          audioMimeType,
          ...(extraPayload || {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate AI draft');
      }

      setResponse(data);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Failed to generate AI draft');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[rgba(27,42,91,0.1)] bg-[linear-gradient(180deg,#FCFAF7_0%,#F6F1EA_100%)] p-5 space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8B7569]">AI Assist</p>
        <h3 className="mt-1 text-lg font-semibold text-[#1B2A5B]">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-[#5C3D2E]">{helperText}</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Requirements</label>
        <textarea
          className="input-field text-sm py-3 w-full"
          rows={4}
          placeholder={promptPlaceholder}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="inline-flex cursor-pointer items-center rounded-full bg-[#1B2A5B] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#0F1A3A]">
          Add Images
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
        </label>

        {voiceSupported ? (
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition ${isRecording ? 'bg-[#C41E3A] text-white' : 'border border-[#1B2A5B] text-[#1B2A5B] hover:bg-[#F8F5F0]'}`}
          >
            {isRecording ? 'Stop Recording' : 'Record Voice Note'}
          </button>
        ) : null}

        {audioBase64 ? (
          <button
            type="button"
            onClick={clearVoiceNote}
            className="rounded-full border border-[#C41E3A] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#C41E3A] hover:bg-[#FFF5F5]"
          >
            Remove Voice Note
          </button>
        ) : null}
      </div>

      {recordingLabel ? <p className="text-xs text-[#8B7569]">{recordingLabel}</p> : null}

      {imageUploads.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {imageUploads.map((image) => (
            <div key={image.id} className="overflow-hidden rounded-xl border border-[rgba(27,42,91,0.08)] bg-white">
              <img src={image.dataUrl} alt={image.name} className="h-28 w-full object-cover" />
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[#1B2A5B]">{image.name}</p>
                  <p className="text-[11px] text-[#8B7569]">{image.sizeLabel}</p>
                </div>
                <button type="button" onClick={() => removeImage(image.id)} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#C41E3A]">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="text-sm text-[#C41E3A]">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary text-sm px-5 py-2.5" onClick={generateDraft} disabled={loading}>
          {loading ? 'Generating Draft...' : 'Generate Draft'}
        </button>
      </div>

      {response ? (
        <div className="rounded-xl border border-[rgba(27,42,91,0.08)] bg-white p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8B7569]">Summary</p>
            <p className="mt-1 text-sm text-[#5C3D2E]">{response.summary}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8B7569] mb-1">Draft Preview</p>
            <pre className="overflow-x-auto rounded-lg bg-[#F8F5F0] p-3 text-xs text-[#1B2A5B]">{JSON.stringify(response.draft, null, 2)}</pre>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="btn-primary text-sm px-5 py-2.5"
              onClick={() => onApply(response.draft, { images: imageUploads.map((image) => image.dataUrl) })}
            >
              Apply Draft To Form
            </button>
            <button type="button" className="btn-outline text-sm px-5 py-2.5" onClick={() => setResponse(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}