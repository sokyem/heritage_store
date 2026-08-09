'use client';

import { useEffect, useRef, useState } from 'react';

// Minimal Web Speech API typing (not in the DOM lib by default).
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type Props = {
  /** Called with each finalized chunk of dictated text. Append it to your field. */
  onTranscript: (text: string) => void;
  className?: string;
};

/**
 * Mic button that dictates speech into text via the browser's Web Speech API.
 * Ideal for single-speaker dictation on a normal page (no video iframe competing
 * for the mic). Renders a small hint instead of the button on unsupported
 * browsers (Safari/Firefox) — use Chrome or Edge.
 */
export default function DictateButton({ onTranscript, className }: Props) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) setSupported(false);
    return () => {
      wantRef.current = false;
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    };
  }, []);

  function start() {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onresult = (event) => {
      let chunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) chunk += r[0].transcript;
      }
      if (chunk.trim()) onTranscript(chunk.trim());
    };

    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Microphone permission denied. Allow mic access for this site, then try again.');
        wantRef.current = false;
        setListening(false);
      } else if (event.error === 'no-speech' || event.error === 'aborted' || event.error === 'network') {
        // transient — onend will restart while we still want it
      } else {
        setError(`Dictation error (${event.error}).`);
      }
    };

    rec.onend = () => {
      // Browsers stop after a pause — restart while the user still wants it.
      if (wantRef.current && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch { /* already started */ }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = rec;
    wantRef.current = true;
    setError('');
    try {
      rec.start();
      setListening(true);
    } catch {
      // already started — ignore
    }
  }

  function stop() {
    wantRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    recognitionRef.current = null;
    setListening(false);
  }

  if (!supported) {
    return (
      <span className="text-[11px] text-[color:var(--aw-text-faint)]">
        🎤 Voice dictation needs Chrome or Edge.
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={listening ? stop : start}
        className={
          className ||
          `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            listening
              ? 'bg-[#C41E3A] text-white animate-pulse'
              : 'border border-[color:var(--aw-border)] text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-surface-muted)]'
          }`
        }
      >
        {listening ? '⏹ Stop dictation' : '🎤 Dictate'}
      </button>
      {listening && <span className="text-[11px] text-[color:var(--aw-text-muted)]">Listening… speak your notes.</span>}
      {error && <span className="text-[11px] text-[color:var(--aw-danger)]">{error}</span>}
    </div>
  );
}
