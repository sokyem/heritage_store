'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type CallPhase = 'lobby' | 'in-call' | 'ended';

interface DeviceInfo {
  deviceId: string;
  label: string;
}

interface JitsiAPI {
  dispose: () => void;
  addEventListener: (event: string, listener: (...args: unknown[]) => void) => void;
  executeCommand: (command: string, ...args: unknown[]) => void;
}

// ── Minimal Web Speech API typings (not in lib.dom for all TS configs) ──
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number;[index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiAPI;
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

// Public Jitsi Meet server — no account or API key required.
const JITSI_DOMAIN = 'meet.jit.si';

const TRANSLATE_LANGUAGES = ['French', 'Spanish', 'Twi', 'Ga', 'Ewe', 'Hausa', 'Arabic', 'Portuguese', 'English'];

/** Load the Jitsi external API script once, resolving when ready. */
function loadJitsiScript(scriptUrl = `https://${JITSI_DOMAIN}/external_api.js`): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) {
      resolve();
      return;
    }
    const existing = document.getElementById('jitsi-external-api') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load the video service.')));
      return;
    }
    const script = document.createElement('script');
    script.id = 'jitsi-external-api';
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load the video service. Check your connection and try again.'));
    document.body.appendChild(script);
  });
}

interface JaasConfig { configured: boolean; appId?: string; domain?: string; token?: string; moderator?: boolean }

export default function VideoCall() {
  // ── State ────────────────────────────────────────────
  const [phase, setPhase] = useState<CallPhase>('lobby');
  const [error, setError] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  // Media state
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  // Device lists
  const [cameras, setCameras] = useState<DeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<DeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMic, setSelectedMic] = useState('');

  // Identity + room
  const [displayName, setDisplayName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [rawRoom, setRawRoom] = useState('');

  // Timer
  const [elapsed, setElapsed] = useState(0);

  // Transcription
  const [transcribing, setTranscribing] = useState(true);
  const [transcriptSupported, setTranscriptSupported] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');

  // Post-call notes / summary / translation
  const [notes, setNotes] = useState('');
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [translateLang, setTranslateLang] = useState('French');
  const [translation, setTranslation] = useState('');
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMsg, setSaveMsg] = useState('');

  // ── Refs ─────────────────────────────────────────────
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<JitsiAPI | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantTranscribeRef = useRef(true);

  // ── Helpers ──────────────────────────────────────────

  const stopStream = useCallback((stream: MediaStream | null) => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
      const mics = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
      setCameras(cams);
      setMicrophones(mics);
      if (cams.length > 0 && !selectedCamera) setSelectedCamera(cams[0].deviceId);
      if (mics.length > 0 && !selectedMic) setSelectedMic(mics[0].deviceId);
    } catch {
      // silently ignore — devices will just be empty
    }
  }, [selectedCamera, selectedMic]);

  const startPreviewStream = useCallback(
    async (camId?: string, micId?: string) => {
      stopStream(streamRef.current);
      try {
        const constraints: MediaStreamConstraints = {
          video: camId ? { deviceId: { exact: camId } } : true,
          audio: micId ? { deviceId: { exact: micId } } : true,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setError(null);
        await enumerateDevices();
      } catch (err: unknown) {
        const msg =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera/microphone access was denied. Please allow access in your browser settings and try again.'
            : err instanceof DOMException && err.name === 'NotFoundError'
              ? 'No camera or microphone found on this device.'
              : 'Unable to access camera or microphone. Please check your device settings.';
        setError(msg);
      }
    },
    [stopStream, enumerateDevices],
  );

  // ── Transcription (Web Speech API) ───────────────────

  const startRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setTranscriptSupported(false);
      return;
    }
    if (recognitionRef.current) return;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      let finalChunk = '';
      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalChunk += result[0].transcript;
        else interimChunk += result[0].transcript;
      }
      if (finalChunk.trim()) {
        setTranscript((prev) => (prev ? `${prev} ${finalChunk.trim()}` : finalChunk.trim()));
      }
      setInterim(interimChunk);
    };

    rec.onerror = (event: { error: string }) => {
      // Permission denials are terminal — stop trying and tell the user.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        console.warn('[transcribe] permission denied:', event.error);
        setTranscriptSupported(false);
        wantTranscribeRef.current = false;
        return;
      }
      // 'no-speech', 'network', 'aborted', 'audio-capture' are transient (the
      // mic is briefly busy while Jitsi acquires it, or a speech-server blip).
      // Log for diagnosis and let onend restart — don't kill transcription.
      console.warn('[transcribe] recognition error (will retry):', event.error);
    };

    rec.onend = () => {
      setInterim('');
      // Browsers stop recognition after a pause — restart while we still want
      // it. A small delay avoids a tight restart loop when the mic is briefly
      // unavailable (e.g. the Jitsi iframe is still acquiring devices).
      if (wantTranscribeRef.current && recognitionRef.current) {
        setTimeout(() => {
          if (wantTranscribeRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {
              // already started — ignore
            }
          }
        }, 400);
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      // already started — ignore
    }
  }, []);

  const stopRecognition = useCallback(() => {
    wantTranscribeRef.current = false;
    setInterim('');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
  }, []);

  const toggleTranscription = () => {
    setTranscribing((prev) => {
      const next = !prev;
      if (next) {
        wantTranscribeRef.current = true;
        startRecognition();
      } else {
        stopRecognition();
      }
      return next;
    });
  };

  // ── Lifecycle ────────────────────────────────────────

  // Resolve the room from the URL (?room=xxxx). Generate one if missing so an
  // admin can start an instant consultation by opening /video-call directly.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let room = params.get('room');
    if (!room) {
      room = Math.random().toString(36).slice(2, 10);
      params.set('room', room);
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }
    const name = params.get('name');
    if (name) setDisplayName(name);
    setRawRoom(room);
    // Namespace the room so it never collides with unrelated public meetings.
    setRoomName(`AwulaKConsultation-${room}`);
  }, []);

  // Start preview on mount
  useEffect(() => {
    startPreviewStream();
    return () => {
      stopStream(streamRef.current);
      stopRecognition();
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer for in-call
  useEffect(() => {
    if (phase === 'in-call') {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // Start/stop transcription with the call
  useEffect(() => {
    if (phase !== 'in-call') return;
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    if (transcribing) {
      wantTranscribeRef.current = true;
      // Let the Jitsi iframe acquire the mic first; the browser can then share
      // the input device with SpeechRecognition. Starting both simultaneously
      // is what most often produced an empty transcript.
      startTimer = setTimeout(() => startRecognition(), 1500);
    }
    return () => {
      if (startTimer) clearTimeout(startTimer);
      stopRecognition();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Mount the Jitsi meeting once we're in-call
  useEffect(() => {
    if (phase !== 'in-call' || !roomName) return;

    let cancelled = false;
    setCallError(null);

    (async () => {
      try {
        // Prefer JaaS (8x8) when configured — un-capped + branded, same UI.
        // Falls back to free public meet.jit.si otherwise.
        let domain = JITSI_DOMAIN;
        let scriptUrl = `https://${JITSI_DOMAIN}/external_api.js`;
        let finalRoom = roomName;
        let jwt: string | undefined;
        let isModerator = false;
        try {
          const r = await fetch(`/api/video/jaas-token?room=${encodeURIComponent(rawRoom)}&name=${encodeURIComponent(displayName || '')}`);
          const j: JaasConfig = await r.json();
          if (j.configured && j.token && j.appId) {
            domain = j.domain || '8x8.vc';
            scriptUrl = `https://${domain}/${j.appId}/external_api.js`;
            finalRoom = `${j.appId}/${roomName}`;
            jwt = j.token;
            isModerator = Boolean(j.moderator);
          }
        } catch {
          // ignore — fall back to free Jitsi
        }

        await loadJitsiScript(scriptUrl);
        if (cancelled || !jitsiContainerRef.current || !window.JitsiMeetExternalAPI) return;

        const api = new window.JitsiMeetExternalAPI(domain, {
          roomName: finalRoom,
          ...(jwt ? { jwt } : {}),
          parentNode: jitsiContainerRef.current,
          width: '100%',
          height: '100%',
          userInfo: { displayName: displayName || 'Awula Guest' },
          configOverwrite: {
            prejoinPageEnabled: false,
            startWithAudioMuted: !micOn,
            startWithVideoMuted: !cameraOn,
            disableDeepLinking: true,
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
            SHOW_JITSI_WATERMARK: false,
            SHOW_CHROME_EXTENSION_BANNER: false,
          },
        });
        jitsiApiRef.current = api;

        // Auto-start cloud recording for the moderator (admin) so every
        // consultation produces a recording the JaaS webhook can transcribe
        // into a both-sides transcript. Only moderators can record; guests
        // joining via their link never trigger this. Best-effort.
        if (isModerator) {
          api.addEventListener('videoConferenceJoined', () => {
            try {
              api.executeCommand('startRecording', { mode: 'file' });
            } catch {
              // recording is best-effort — never break the call over it
            }
          });
        }

        // Jitsi fires this when the user leaves or the call is closed.
        api.addEventListener('readyToClose', () => {
          if (!cancelled) handleEnd();
        });
      } catch (err: unknown) {
        if (!cancelled) {
          setCallError(err instanceof Error ? err.message : 'Could not start the video call.');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.dispose();
        } catch {
          // ignore dispose errors
        }
        jitsiApiRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, roomName]);

  // ── Actions ──────────────────────────────────────────

  const handleJoin = async () => {
    // Release our preview stream so Jitsi can take over the devices cleanly.
    stopStream(streamRef.current);
    streamRef.current = null;
    setPhase('in-call');
  };

  const handleEnd = () => {
    stopRecognition();
    if (jitsiApiRef.current) {
      try {
        jitsiApiRef.current.dispose();
      } catch {
        // ignore dispose errors
      }
      jitsiApiRef.current = null;
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    setPhase('ended');
  };

  const toggleCamera = () => {
    if (!streamRef.current) {
      setCameraOn((prev) => !prev);
      return;
    }
    streamRef.current.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setCameraOn((prev) => !prev);
  };

  const toggleMic = () => {
    if (!streamRef.current) {
      setMicOn((prev) => !prev);
      return;
    }
    streamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setMicOn((prev) => !prev);
  };

  const handleDeviceChange = async (type: 'camera' | 'mic', deviceId: string) => {
    if (type === 'camera') {
      setSelectedCamera(deviceId);
      await startPreviewStream(deviceId, selectedMic);
    } else {
      setSelectedMic(deviceId);
      await startPreviewStream(selectedCamera, deviceId);
    }
  };

  const handleSummarize = async () => {
    if (!transcript.trim() && !notes.trim()) {
      setSummaryError('There is no transcript or notes to summarize yet.');
      return;
    }
    setSummarizing(true);
    setSummaryError('');
    try {
      const res = await fetch('/api/transcribe/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Summary failed.');
      setSummary(data.summary || '');
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Summary failed.');
    } finally {
      setSummarizing(false);
    }
  };

  const handleTranslate = async () => {
    const source = `${transcript}${notes ? `\n\nNotes:\n${notes}` : ''}`.trim();
    if (!source) {
      setTranslateError('There is no transcript or notes to translate yet.');
      return;
    }
    setTranslating(true);
    setTranslateError('');
    setTranslation('');
    try {
      const res = await fetch('/api/transcribe/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: source, targetLanguage: translateLang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Translation failed.');
      setTranslation(data.translation || '');
    } catch (err) {
      setTranslateError(err instanceof Error ? err.message : 'Translation failed.');
    } finally {
      setTranslating(false);
    }
  };

  const handleSaveNotes = async () => {
    setSaveState('saving');
    setSaveMsg('');
    const callNotes = [
      notes.trim(),
      summary.trim() ? `--- AI Summary ---\n${summary.trim()}` : '',
      translation.trim() ? `--- Translation (${translateLang}) ---\n${translation.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    try {
      const res = await fetch('/api/consultation-bookings/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: rawRoom, callNotes, callTranscript: transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save notes.');
      setSaveState('saved');
      setSaveMsg(data.saved ? 'Notes & transcript saved to the booking.' : data.reason || 'Saved.');
    } catch (err) {
      setSaveState('error');
      setSaveMsg(err instanceof Error ? err.message : 'Could not save notes.');
    }
  };

  // ── Format helpers ───────────────────────────────────

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // ── SVG Icons (inline to avoid extra deps) ──────────

  const IconMic = ({ muted }: { muted: boolean }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
      {muted && <line x1="1" y1="1" x2="23" y2="23" stroke="var(--aw-danger)" strokeWidth="2.5" />}
    </svg>
  );

  const IconCamera = ({ off }: { off: boolean }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      {off && <line x1="1" y1="1" x2="23" y2="23" stroke="var(--aw-danger)" strokeWidth="2.5" />}
    </svg>
  );

  // ── Render ───────────────────────────────────────────

  // ─── LOBBY ──────────────────────────────────────────
  if (phase === 'lobby') {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--aw-navy-dark)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
        }}
      >
        <div
          className="animate-scale-in"
          style={{
            background: 'var(--aw-white)',
            borderRadius: '12px',
            maxWidth: '560px',
            width: '100%',
            overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
          }}
        >
          {/* Camera preview */}
          <div
            style={{
              position: 'relative',
              background: '#111',
              aspectRatio: '16/9',
              overflow: 'hidden',
            }}
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)',
                display: cameraOn && !error ? 'block' : 'none',
              }}
            />
            {(!cameraOn || error) && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#888',
                  fontSize: '1rem',
                  textAlign: 'center',
                  padding: '1rem',
                }}
              >
                {error ? error : 'Camera is off'}
              </div>
            )}
            {/* Quick toggles over preview */}
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '10px',
              }}
            >
              <button
                onClick={toggleMic}
                title={micOn ? 'Mute microphone' : 'Unmute microphone'}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: micOn ? 'rgba(255,255,255,0.15)' : 'var(--aw-danger)',
                  color: '#fff',
                  backdropFilter: 'blur(8px)',
                  transition: 'all 0.2s ease',
                }}
              >
                <IconMic muted={!micOn} />
              </button>
              <button
                onClick={toggleCamera}
                title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: cameraOn ? 'rgba(255,255,255,0.15)' : 'var(--aw-danger)',
                  color: '#fff',
                  backdropFilter: 'blur(8px)',
                  transition: 'all 0.2s ease',
                }}
              >
                <IconCamera off={!cameraOn} />
              </button>
            </div>
          </div>

          {/* Info / controls */}
          <div style={{ padding: '1.5rem' }}>
            <h2
              style={{
                fontWeight: 500,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--aw-navy)',
                margin: '0 0 0.25rem',
                fontSize: '1.3rem',
                fontFamily: 'var(--font-heading)',
              }}
            >
              Video Consultation
            </h2>
            <p
              style={{
                color: 'var(--aw-warm-gray)',
                fontSize: '1rem',
                margin: '0 0 1.25rem',
              }}
            >
              Check your camera and microphone, then join when ready.
            </p>

            {/* Display name */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label className="input-label">Your Name</label>
              <input
                className="input-field"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>

            {/* Device selectors */}
            {cameras.length > 1 && (
              <div style={{ marginBottom: '0.75rem' }}>
                <label className="input-label">Camera</label>
                <select
                  className="input-field"
                  value={selectedCamera}
                  onChange={(e) => handleDeviceChange('camera', e.target.value)}
                >
                  {cameras.map((c) => (
                    <option key={c.deviceId} value={c.deviceId}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {microphones.length > 1 && (
              <div style={{ marginBottom: '1rem' }}>
                <label className="input-label">Microphone</label>
                <select
                  className="input-field"
                  value={selectedMic}
                  onChange={(e) => handleDeviceChange('mic', e.target.value)}
                >
                  {microphones.map((m) => (
                    <option key={m.deviceId} value={m.deviceId}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Live transcript toggle */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                margin: '0 0 1rem',
                fontSize: '0.95rem',
                color: 'var(--aw-navy)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={transcribing}
                onChange={(e) => setTranscribing(e.target.checked)}
              />
              Capture an AI live transcript of this call
            </label>

            <button
              onClick={handleJoin}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                background: 'var(--aw-navy)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '1rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                transition: 'background 0.2s ease',
              }}
            >
              Join Consultation
            </button>
            {error && (
              <p style={{ color: 'var(--aw-danger)', fontSize: '0.85rem', margin: '0.75rem 0 0', textAlign: 'center' }}>
                You can still join — devices can be enabled inside the call.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── IN-CALL ────────────────────────────────────────
  if (phase === 'in-call') {
    return (
      <div
        style={{
          minHeight: '100vh',
          height: '100vh',
          background: '#0c0c0c',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {callError ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              color: '#fff',
              padding: '2rem',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: '1.05rem', maxWidth: '420px' }}>{callError}</p>
            <button
              className="btn-primary"
              onClick={() => setPhase('lobby')}
              style={{ padding: '12px 28px' }}
            >
              Back to Lobby
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
            <div ref={jitsiContainerRef} style={{ width: '100%', height: '100%' }} />

            {/* Transcript status badge */}
            <button
              onClick={toggleTranscription}
              title={transcribing ? 'Pause live transcript' : 'Resume live transcript'}
              style={{
                position: 'absolute',
                top: '14px',
                left: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '6px 12px',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
                background: 'rgba(0,0,0,0.65)',
                color: '#fff',
                fontSize: '0.8rem',
                fontWeight: 500,
                backdropFilter: 'blur(6px)',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: transcribing && transcriptSupported ? '#22c55e' : '#888',
                  boxShadow: transcribing && transcriptSupported ? '0 0 6px #22c55e' : 'none',
                }}
              />
              {!transcriptSupported
                ? 'Transcript unavailable'
                : transcribing
                  ? 'Live transcript on'
                  : 'Transcript paused'}
            </button>

            {/* Live interim caption */}
            {transcribing && transcriptSupported && interim && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '90px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  maxWidth: '70%',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.7)',
                  color: '#fff',
                  fontSize: '0.95rem',
                  textAlign: 'center',
                  backdropFilter: 'blur(6px)',
                }}
              >
                {interim}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── POST-CALL ──────────────────────────────────────
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--aw-ivory)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          background: 'var(--aw-white)',
          borderRadius: '12px',
          maxWidth: '640px',
          width: '100%',
          padding: '2.5rem 2rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        }}
      >
        {/* Checkmark icon */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(34,139,34,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#228B22" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h2
            style={{
              fontWeight: 500,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--aw-navy)',
              margin: '0 0 0.5rem',
              fontSize: '1.3rem',
              fontFamily: 'var(--font-heading)',
            }}
          >
            Call Ended
          </h2>
          <p style={{ color: 'var(--aw-warm-gray)', fontSize: '1rem', margin: '0 0 0.25rem' }}>
            Duration: {formatTime(elapsed)}
          </p>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--aw-border)', margin: '1.5rem 0' }} />

        {/* AI Transcript */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label className="input-label" style={{ fontSize: '1rem' }}>
            AI Transcript
          </label>
          {!transcriptSupported && !transcript ? (
            <p style={{ color: 'var(--aw-warm-gray)', fontSize: '0.9rem', margin: '0.25rem 0 0' }}>
              Live transcription isn&apos;t supported in this browser. Use Chrome or Edge to capture
              a transcript automatically.
            </p>
          ) : (
            <textarea
              className="input-field"
              rows={6}
              placeholder="The transcript captured during the call appears here. You can edit it before saving."
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              style={{ resize: 'vertical', fontSize: '0.95rem' }}
            />
          )}
        </div>

        {/* Notes */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label className="input-label" style={{ fontSize: '1rem' }}>
            Consultation Notes
          </label>
          <textarea
            className="input-field"
            rows={4}
            placeholder="Add any notes from your consultation..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ resize: 'vertical', fontSize: '1rem' }}
          />
        </div>

        {/* AI Summary */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label className="input-label" style={{ fontSize: '1rem' }}>
            AI Summary
          </label>
          <button
            className="btn-outline"
            onClick={handleSummarize}
            disabled={summarizing || (!transcript.trim() && !notes.trim())}
            style={{ whiteSpace: 'nowrap', padding: '10px 18px', margin: '0.25rem 0 0.5rem' }}
          >
            {summarizing ? 'Summarizing…' : 'Summarize transcript → notes'}
          </button>
          {summaryError && (
            <p style={{ color: 'var(--aw-danger)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
              {summaryError}
            </p>
          )}
          {summary && (
            <textarea
              className="input-field"
              rows={8}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              style={{ resize: 'vertical', fontSize: '0.95rem' }}
            />
          )}
        </div>

        {/* Translation */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label className="input-label" style={{ fontSize: '1rem' }}>
            AI Translation
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '0.5rem' }}>
            <select
              className="input-field"
              value={translateLang}
              onChange={(e) => setTranslateLang(e.target.value)}
              style={{ flex: 1 }}
            >
              {TRANSLATE_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <button
              className="btn-outline"
              onClick={handleTranslate}
              disabled={translating}
              style={{ whiteSpace: 'nowrap', padding: '10px 18px' }}
            >
              {translating ? 'Translating…' : 'Translate'}
            </button>
          </div>
          {translateError && (
            <p style={{ color: 'var(--aw-danger)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
              {translateError}
            </p>
          )}
          {translation && (
            <textarea
              className="input-field"
              rows={5}
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              style={{ resize: 'vertical', fontSize: '0.95rem' }}
            />
          )}
        </div>

        {/* Save status */}
        {saveMsg && (
          <p
            style={{
              fontSize: '0.9rem',
              margin: '0 0 1rem',
              color: saveState === 'error' ? 'var(--aw-danger)' : '#228B22',
            }}
          >
            {saveMsg}
          </p>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn-outline"
            onClick={() => {
              setPhase('lobby');
              setElapsed(0);
              setSaveState('idle');
              setSaveMsg('');
              startPreviewStream(selectedCamera, selectedMic);
            }}
            style={{ flex: 1 }}
          >
            Rejoin Call
          </button>
          <button
            className="btn-primary"
            onClick={handleSaveNotes}
            disabled={saveState === 'saving'}
            style={{ flex: 1 }}
          >
            {saveState === 'saving' ? 'Saving…' : 'Save Notes & Transcript'}
          </button>
        </div>
        <button
          onClick={() => {
            window.location.href = '/';
          }}
          style={{
            display: 'block',
            margin: '1rem auto 0',
            background: 'none',
            border: 'none',
            color: 'var(--aw-navy)',
            fontSize: '0.9rem',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
}
