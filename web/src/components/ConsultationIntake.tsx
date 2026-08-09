'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ConsultNavIcon,
  HomeNavIcon,
  OrdersNavIcon,
  ProfileNavIcon,
  StudioNavIcon,
  UploadImageIcon,
} from '@/components/LuxuryIcons';

interface AIRecommendations {
  silhouettes: string[];
  accessories: string[];
  pricingGuidance: string;
  moodDescription: string;
}

interface AnalysisResult {
  styleSummary: string;
  fabricSuggestions: string;
  designNotes: string;
  aiRecommendations: AIRecommendations;
}

type Stage = 'form' | 'analyzing' | 'generating' | 'results' | 'booking' | 'booked' | 'error';

interface SlotOption {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  type: string;
  isFull: boolean;
}

interface BookingResult {
  id: string;
  meetingLink: string;
  slot: SlotOption;
  customerName: string;
  customerEmail: string;
}

type DesignSource = 'ai' | 'fallback';

type InspirationUpload = {
  id: string;
  name: string;
  dataUrl: string;
  sizeLabel: string;
};

const bodyProfiles = [
  {
    id: 'hourglass',
    label: 'Hourglass',
    summary: 'Balanced shoulders and hips with a defined waist.',
    fitCue: 'Highlights waist definition with fluid structure.',
    dimensions: { shoulders: 34, waist: 20, hips: 36, hemY: 112 },
  },
  {
    id: 'pear',
    label: 'Pear',
    summary: 'Gentle shoulder line with more volume at the hips.',
    fitCue: 'Adds presence up top and soft movement below.',
    dimensions: { shoulders: 30, waist: 22, hips: 40, hemY: 114 },
  },
  {
    id: 'athletic',
    label: 'Athletic',
    summary: 'Strong shoulders and clean, elongating lines.',
    fitCue: 'Brings shape through drape, contour, and waist placement.',
    dimensions: { shoulders: 38, waist: 26, hips: 34, hemY: 114 },
  },
  {
    id: 'petite',
    label: 'Petite',
    summary: 'Shorter vertical line that benefits from visual lift.',
    fitCue: 'Keeps proportions lengthened and details scaled elegantly.',
    dimensions: { shoulders: 32, waist: 22, hips: 34, hemY: 106 },
  },
  {
    id: 'tall',
    label: 'Tall',
    summary: 'Long vertical line that carries dramatic silhouettes well.',
    fitCue: 'Balances length with strong seams and sculpted rhythm.',
    dimensions: { shoulders: 34, waist: 23, hips: 35, hemY: 120 },
  },
] as const;

const bottomNavItems = [
  { href: '/', label: 'Home', Icon: HomeNavIcon },
  { href: '/orders', label: 'Orders', Icon: OrdersNavIcon },
  { href: '/consults', label: 'Consult', Icon: ConsultNavIcon, active: true },
  { href: '/measurements', label: 'Profile', Icon: ProfileNavIcon },
  { href: '/customer/dashboard', label: 'Account', Icon: StudioNavIcon },
];

function formatFileSize(size: number) {
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function createBodySilhouettePath(shoulders: number, waist: number, hips: number, hemY: number) {
  const leftShoulder = 50 - shoulders / 2;
  const rightShoulder = 50 + shoulders / 2;
  const leftWaist = 50 - waist / 2;
  const rightWaist = 50 + waist / 2;
  const leftHip = 50 - hips / 2;
  const rightHip = 50 + hips / 2;

  return [
    `M 50 19`,
    `Q ${leftShoulder + 4} 20 ${leftShoulder} 28`,
    `L ${leftWaist} 56`,
    `Q ${leftHip} 75 ${leftHip} 92`,
    `L 50 ${hemY}`,
    `L ${rightHip} 92`,
    `Q ${rightHip} 75 ${rightWaist} 56`,
    `L ${rightShoulder} 28`,
    `Q ${rightShoulder - 4} 20 50 19 Z`,
  ].join(' ');
}

function BodyProfileIcon({ selected, profile }: { selected: boolean; profile: (typeof bodyProfiles)[number] }) {
  const path = createBodySilhouettePath(
    profile.dimensions.shoulders,
    profile.dimensions.waist,
    profile.dimensions.hips,
    profile.dimensions.hemY,
  );

  return (
    <svg viewBox="0 0 100 124" className="h-28 w-20" fill="none">
      <circle cx="50" cy="10" r="6.5" fill={selected ? '#C41E3A' : '#D7DCE7'} />
      <path d={path} fill={selected ? 'rgba(196,30,58,0.18)' : 'rgba(27,42,91,0.10)'} stroke={selected ? '#C41E3A' : '#7081AE'} strokeWidth="2.2" />
      <path d="M40 29h20" stroke={selected ? '#C41E3A' : '#7081AE'} strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      <path d="M36 62h28" stroke={selected ? '#C41E3A' : '#7081AE'} strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

function BottomNav() {
  return (
    <nav className="fixed bottom-0 w-full bg-white/95 backdrop-blur-sm border-t border-gray-100 shadow-luxury">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-around items-center py-3.5">
          {bottomNavItems.map(({ href, label, Icon, active }) => (
            <a key={href} href={href} className="flex flex-col items-center gap-1.5 min-w-[58px]">
              <span
                className={`grid h-11 w-11 place-items-center rounded-2xl border transition-colors ${active ? 'bg-[#1B2A5B] text-white border-[#1B2A5B] shadow-[0_12px_24px_rgba(27,42,91,0.22)]' : 'bg-[#F7F4EF] text-[#1B2A5B] border-[rgba(27,42,91,0.08)]'}`}
              >
                <Icon className="h-5.5 w-5.5" />
              </span>
              <span className={`text-[0.72rem] tracking-[0.08em] uppercase ${active ? 'text-[#1B2A5B] font-semibold' : 'text-[#8B7569]'}`}>{label}</span>
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}

export default function ConsultationIntake() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('form');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedBodyProfile, setSelectedBodyProfile] = useState<(typeof bodyProfiles)[number]['id'] | ''>('');
  const [inspirationUploads, setInspirationUploads] = useState<InspirationUpload[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [formData, setFormData] = useState({
    eventType: '',
    eventDate: '',
    budget: '',
    stylePreferences: '',
    bodyType: '',
    colors: '',
    inspiration: '',
    specialNotes: '',
  });

  // Booking flow state
  const [consultationId, setConsultationId] = useState('');
  const [availableSlots, setAvailableSlots] = useState<SlotOption[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingData, setBookingData] = useState({ name: '', email: '', phone: '' });
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [bookingError, setBookingError] = useState('');

  // Body photo upload state
  const [bodyPhotoUploads, setBodyPhotoUploads] = useState<InspirationUpload[]>([]);
  const [bodyPhotoError, setBodyPhotoError] = useState('');

  // AI-generated design images
  const [generatedDesigns, setGeneratedDesigns] = useState<{ url: string; label: string }[]>([]);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [designSource, setDesignSource] = useState<DesignSource>('fallback');
  const [designMessage, setDesignMessage] = useState('');

  const selectedBodyProfileLabel = bodyProfiles.find((profile) => profile.id === selectedBodyProfile)?.label;

  const readImageAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const fileReader = new FileReader();

      fileReader.onload = () => {
        const image = new Image();

        image.onload = () => {
          const maxDimension = 1400;
          const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));

          const context = canvas.getContext('2d');
          if (!context) {
            reject(new Error('Canvas is not available in this browser.'));
            return;
          }

          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };

        image.onerror = () => reject(new Error(`Could not process ${file.name}.`));
        image.src = String(fileReader.result);
      };

      fileReader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      fileReader.readAsDataURL(file);
    });

  const handleInspirationUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (!selectedFiles.length) {
      return;
    }

    const totalAfterUpload = inspirationUploads.length + selectedFiles.length;
    if (totalAfterUpload > 3) {
      setUploadError('Please upload up to three inspiration images.');
      event.target.value = '';
      return;
    }

    const invalidFile = selectedFiles.find((file) => !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024);
    if (invalidFile) {
      setUploadError('Uploads must be image files under 5 MB each.');
      event.target.value = '';
      return;
    }

    try {
      const uploads = await Promise.all(
        selectedFiles.map(async (file, index) => ({
          id: `${file.name}-${file.size}-${Date.now()}-${index}`,
          name: file.name,
          dataUrl: await readImageAsDataUrl(file),
          sizeLabel: formatFileSize(file.size),
        })),
      );

      setInspirationUploads((current) => [...current, ...uploads]);
      setUploadError('');
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not upload those images.');
    } finally {
      event.target.value = '';
    }
  };

  const removeInspirationUpload = (id: string) => {
    setInspirationUploads((current) => current.filter((upload) => upload.id !== id));
  };

  const handleBodyPhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (!selectedFiles.length) return;

    const totalAfterUpload = bodyPhotoUploads.length + selectedFiles.length;
    if (totalAfterUpload > 2) {
      setBodyPhotoError('Please upload up to two body reference photos.');
      event.target.value = '';
      return;
    }

    const invalidFile = selectedFiles.find((file) => !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024);
    if (invalidFile) {
      setBodyPhotoError('Uploads must be image files under 5 MB each.');
      event.target.value = '';
      return;
    }

    try {
      const uploads = await Promise.all(
        selectedFiles.map(async (file, index) => ({
          id: `body-${file.name}-${file.size}-${Date.now()}-${index}`,
          name: file.name,
          dataUrl: await readImageAsDataUrl(file),
          sizeLabel: formatFileSize(file.size),
        })),
      );
      setBodyPhotoUploads((current) => [...current, ...uploads]);
      setBodyPhotoError('');
    } catch (error) {
      setBodyPhotoError(error instanceof Error ? error.message : 'Could not upload those images.');
    } finally {
      event.target.value = '';
    }
  };

  const removeBodyPhoto = (id: string) => {
    setBodyPhotoUploads((current) => current.filter((upload) => upload.id !== id));
  };

  const generateDesignImages = async (consultationIdForGen: string) => {
    setIsGeneratingImages(true);
    setStage('generating');
    try {
      const res = await fetch('/api/consultations/generate-designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId: consultationIdForGen }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedDesigns(data.designs || []);
        setDesignSource(data.source === 'ai' ? 'ai' : 'fallback');
        setDesignMessage(typeof data.message === 'string' ? data.message : '');
      }
    } catch {
      // Non-critical — continue without images
    } finally {
      setIsGeneratingImages(false);
      setStage('results');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStage('analyzing');

    const inspirationPayload = JSON.stringify({
      notes: formData.inspiration,
      uploads: inspirationUploads.map(({ name, dataUrl, sizeLabel }) => ({ name, dataUrl, sizeLabel })),
      bodyReferencePhotos: bodyPhotoUploads.map(({ name, dataUrl, sizeLabel }) => ({ name, dataUrl, sizeLabel })),
    });

    const bodyTypePayload = [
      selectedBodyProfileLabel ? `Selected body profile: ${selectedBodyProfileLabel}` : '',
      formData.bodyType ? `Fit goals: ${formData.bodyType}` : '',
      bodyPhotoUploads.length > 0 ? `Body reference photos uploaded: ${bodyPhotoUploads.length}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      // Step 1: Save consultation
      const saveRes = await fetch('/api/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          bodyType: bodyTypePayload,
          inspiration: inspirationPayload,
          date: new Date().toISOString(),
        }),
      });

      if (!saveRes.ok) {
        throw new Error('Failed to save consultation');
      }

      const consultation = await saveRes.json();
      setConsultationId(consultation.id);

      // Step 2: Trigger AI analysis
      const analyzeRes = await fetch('/api/consultations/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId: consultation.id }),
      });

      if (!analyzeRes.ok) {
        throw new Error('Analysis failed');
      }

      const result = await analyzeRes.json();
      setAnalysis(result.analysis);

      // Step 3: Generate design images (non-blocking)
      generateDesignImages(consultation.id);
    } catch (err) {
      console.error('Consultation error:', err);
      setErrorMessage(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      );
      setStage('error');
    }
  };

  // --- Analyzing State ---
  if (stage === 'analyzing') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAF7F2' }}>
        <div className="text-center max-w-lg mx-auto px-6">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6" style={{ backgroundColor: '#1B2A5B' }}>
              <svg className="w-10 h-10 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          </div>
          <h2 className="text-4xl font-light mb-4" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
            Analyzing Your Style Preferences...
          </h2>
          <p className="text-xl text-gray-600" style={{ fontFamily: 'var(--font-heading)' }}>
            Our AI is crafting personalized recommendations based on your vision.
            This takes just a moment.
          </p>
          <div className="mt-8 flex justify-center space-x-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-full animate-pulse"
                style={{
                  backgroundColor: '#C41E3A',
                  animationDelay: `${i * 0.3}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- Generating Design Images State ---
  if (stage === 'generating') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAF7F2' }}>
        <div className="text-center max-w-lg mx-auto px-6">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6" style={{ backgroundColor: '#C41E3A' }}>
              <svg className="w-10 h-10 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
              </svg>
            </div>
          </div>
          <h2 className="text-4xl font-light mb-4" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
            Designing Your Custom Looks...
          </h2>
          <p className="text-xl text-gray-600" style={{ fontFamily: 'var(--font-heading)' }}>
            Our AI is generating personalized design concepts tailored to your body type and style preferences.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            {['Sketching silhouettes', 'Selecting fabrics', 'Rendering details'].map((step, i) => (
              <div
                key={step}
                className="px-4 py-2 rounded-full text-sm font-medium animate-pulse"
                style={{
                  backgroundColor: 'rgba(196,30,58,0.1)',
                  color: '#C41E3A',
                  animationDelay: `${i * 0.5}s`,
                }}
              >
                {step}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- Error State ---
  if (stage === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAF7F2' }}>
        <div className="text-center max-w-lg mx-auto px-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 bg-red-50">
            <svg className="w-10 h-10" style={{ color: '#C41E3A' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-4xl font-light mb-4" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
            Something Went Wrong
          </h2>
          <p className="text-xl text-gray-600 mb-8">{errorMessage}</p>
          <button
            onClick={() => { setStage('form'); setErrorMessage(''); }}
            className="px-8 py-3 text-white rounded-lg transition-colors text-xl"
            style={{ backgroundColor: '#1B2A5B' }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // --- Results State ---
  if (stage === 'results' && analysis) {
    const recs = analysis.aiRecommendations;
    const showingAiDesigns = designSource === 'ai';

    return (
      <div className="min-h-screen" style={{ backgroundColor: '#FAF7F2' }}>
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <h1 className="text-3xl font-light" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
                Your Style Analysis
              </h1>
              <a href="/" className="text-base hover:underline" style={{ color: '#1B2A5B' }}>
                Back to AWULA_K
              </a>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pb-32">
          {/* Mood Description Banner */}
          {recs.moodDescription && (
            <div
              className="text-center mb-12 py-8 px-6 rounded-xl"
              style={{ backgroundColor: '#1B2A5B' }}
            >
              <p
                className="text-2xl italic text-white opacity-90"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                &ldquo;{recs.moodDescription}&rdquo;
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Style Summary */}
            <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 md:col-span-2">
              <div className="flex items-center mb-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center mr-3"
                  style={{ backgroundColor: '#C41E3A' }}
                >
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-medium" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
                  Style Summary
                </h3>
              </div>
              <p className="text-gray-700 leading-relaxed text-xl">{analysis.styleSummary}</p>
            </div>

            {/* Fabric Recommendations */}
            <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100">
              <div className="flex items-center mb-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center mr-3"
                  style={{ backgroundColor: '#1B2A5B' }}
                >
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                </div>
                <h3 className="text-2xl font-medium" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
                  Fabric Recommendations
                </h3>
              </div>
              <p className="text-gray-700 leading-relaxed text-base">{analysis.fabricSuggestions}</p>
            </div>

            {/* Design Notes */}
            <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100">
              <div className="flex items-center mb-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center mr-3"
                  style={{ backgroundColor: '#1B2A5B' }}
                >
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-medium" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
                  Design Notes
                </h3>
              </div>
              <p className="text-gray-700 leading-relaxed text-base">{analysis.designNotes}</p>
            </div>

            {/* Recommended Silhouettes */}
            <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100">
              <h3 className="text-xl font-medium mb-4" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
                Recommended Silhouettes
              </h3>
              <ul className="space-y-3">
                {recs.silhouettes.map((s, i) => (
                  <li key={i} className="flex items-start">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm mr-3 mt-0.5 flex-shrink-0"
                      style={{ backgroundColor: '#C41E3A' }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-gray-700 text-base">{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Accessory Suggestions */}
            <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100">
              <h3 className="text-xl font-medium mb-4" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
                Accessory Suggestions
              </h3>
              <ul className="space-y-3">
                {recs.accessories.map((a, i) => (
                  <li key={i} className="flex items-start">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm mr-3 mt-0.5 flex-shrink-0"
                      style={{ backgroundColor: '#C41E3A' }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-gray-700 text-base">{a}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Pricing Guidance */}
            <div
              className="md:col-span-2 rounded-xl p-8"
              style={{ backgroundColor: '#1B2A5B' }}
            >
              <h3 className="text-xl font-medium text-white mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
                Investment Guidance
              </h3>
              <p className="text-white opacity-90 leading-relaxed text-base">{recs.pricingGuidance}</p>
            </div>
          </div>

          {/* AI Generated Design Concepts */}
          {generatedDesigns.length > 0 && (
            <div className="mt-12">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4" style={{ backgroundColor: '#C41E3A' }}>
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
                  </svg>
                </div>
                <h3 className="text-3xl font-light mb-2" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
                  {showingAiDesigns ? 'Your AI Design Concepts' : 'Your Studio Reference Concepts'}
                </h3>
                <p className="text-gray-500 text-base max-w-lg mx-auto">
                  {showingAiDesigns
                    ? 'AI-generated design visualizations based on your body type, style preferences, and inspiration.'
                    : 'Curated studio references matched to your body type, style preferences, and inspiration.'}
                </p>
              </div>
              {designMessage && (
                <div className="mb-6 rounded-xl border px-5 py-4 text-sm text-center"
                  style={{
                    borderColor: showingAiDesigns ? 'rgba(27,42,91,0.12)' : 'rgba(196,30,58,0.18)',
                    backgroundColor: showingAiDesigns ? 'rgba(27,42,91,0.04)' : 'rgba(196,30,58,0.06)',
                    color: showingAiDesigns ? '#1B2A5B' : '#8C2330',
                  }}
                >
                  {designMessage}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {generatedDesigns.map((design, i) => (
                  <div
                    key={i}
                    className="group overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm hover:shadow-lg transition-shadow duration-300"
                  >
                    <div className="relative" style={{ aspectRatio: '3/4' }}>
                      <img
                        src={design.url}
                        alt={design.label}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </div>
                    <div className="p-4">
                      <p className="text-sm font-medium text-[#1B2A5B]" style={{ fontFamily: 'var(--font-heading)' }}>
                        {design.label}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {isGeneratingImages && (
                <p className="text-center text-sm text-[#8B7569] mt-4 animate-pulse">
                  Generating additional design concepts...
                </p>
              )}
            </div>
          )}

          {/* Generate Designs Button (if none generated yet) */}
          {generatedDesigns.length === 0 && !isGeneratingImages && (
            <div className="text-center mt-8">
              <button
                onClick={() => generateDesignImages(consultationId)}
                className="inline-flex items-center gap-3 px-8 py-3.5 rounded-lg text-white text-base font-medium transition-all hover:shadow-lg"
                style={{ backgroundColor: '#C41E3A' }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
                </svg>
                Generate Custom Design Concepts
              </button>
              <p className="text-sm text-[#8B7569] mt-3">
                Generate design concepts. AI renders appear when the image service is available.
              </p>
            </div>
          )}

          {/* CTA */}
          <div className="text-center mt-12">
            <button
              onClick={async () => {
                setSlotsLoading(true);
                setBookingError('');
                try {
                  const res = await fetch('/api/consultation-slots?available=true');
                  if (!res.ok) throw new Error('Failed to load available slots');
                  const slots = await res.json();
                  setAvailableSlots(slots.filter((s: SlotOption) => !s.isFull));
                  setStage('booking');
                } catch {
                  setBookingError('Could not load available time slots. Please try again.');
                } finally {
                  setSlotsLoading(false);
                }
              }}
              className="text-white text-xl px-12 py-4 rounded-lg transition-all hover:shadow-lg"
              style={{ backgroundColor: '#C41E3A' }}
              disabled={slotsLoading}
            >
              {slotsLoading ? 'Loading Slots...' : 'Book a Consultation'}
            </button>
            <p className="text-gray-500 mt-4 text-base">
              Choose a time slot to discuss your personalized recommendations with our founder
            </p>
            <button
              onClick={() => { setStage('form'); setAnalysis(null); }}
              className="mt-4 text-base underline"
              style={{ color: '#1B2A5B' }}
            >
              Start a New Analysis
            </button>
          </div>
        </main>

        <BottomNav />
      </div>
    );
  }

  // --- Booking Stage (slot picker) ---
  if (stage === 'booking') {
    // Group available slots by date
    const slotsByDate = availableSlots.reduce<Record<string, SlotOption[]>>((acc, slot) => {
      const dateKey = new Date(slot.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(slot);
      return acc;
    }, {});

    const handleBooking = async () => {
      if (!selectedSlotId || !bookingData.name || !bookingData.email) return;
      setBookingError('');
      try {
        const res = await fetch('/api/consultation-bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slotId: selectedSlotId,
            consultationId: consultationId || undefined,
            customerName: bookingData.name,
            customerEmail: bookingData.email,
            customerPhone: bookingData.phone || undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Booking failed');
        }
        const result = await res.json();
        const slot = availableSlots.find(s => s.id === selectedSlotId);
        setBookingResult({
          id: result.id,
          meetingLink: result.meetingLink,
          slot: slot!,
          customerName: bookingData.name,
          customerEmail: bookingData.email,
        });
        setStage('booked');
      } catch (err) {
        setBookingError(err instanceof Error ? err.message : 'Booking failed. Please try again.');
      }
    };

    return (
      <div className="min-h-screen" style={{ backgroundColor: '#FAF7F2' }}>
        <header className="bg-white shadow-sm border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <h1 className="text-3xl font-light" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
                Book Your Consultation
              </h1>
              <button onClick={() => setStage('results')} className="text-base hover:underline" style={{ color: '#1B2A5B' }}>
                &larr; Back to Results
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pb-32">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-light mb-3" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
              Choose Your Time
            </h2>
            <p className="text-xl text-gray-600">
              Select an available slot for your personalized consultation
            </p>
          </div>

          {bookingError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-5 py-4 mb-6 text-center">
              {bookingError}
            </div>
          )}

          {availableSlots.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-100">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h3 className="text-2xl font-light mb-2" style={{ color: '#1B2A5B' }}>No Available Slots</h3>
              <p className="text-gray-500">Please check back later. Our team will add new consultation times soon.</p>
            </div>
          ) : (
            <>
              {/* Slot selection */}
              <div className="space-y-6 mb-10">
                {Object.entries(slotsByDate).map(([dateLabel, slots]) => (
                  <div key={dateLabel} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="bg-[#1B2A5B] px-6 py-3">
                      <h3 className="text-white font-medium text-lg" style={{ fontFamily: 'var(--font-heading)' }}>{dateLabel}</h3>
                    </div>
                    <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {slots
                        .sort((a, b) => a.startTime.localeCompare(b.startTime))
                        .map(slot => (
                          <button
                            key={slot.id}
                            onClick={() => setSelectedSlotId(slot.id)}
                            className={`p-4 rounded-lg border-2 text-center transition-all ${
                              selectedSlotId === slot.id
                                ? 'border-[#C41E3A] bg-[#C41E3A]/5 shadow-md'
                                : 'border-gray-200 hover:border-[#1B2A5B] hover:bg-gray-50'
                            }`}
                          >
                            <p className="text-lg font-semibold" style={{ color: '#1B2A5B' }}>
                              {slot.startTime}
                            </p>
                            <p className="text-sm text-gray-500">{slot.startTime} – {slot.endTime}</p>
                            <p className="text-xs mt-1 capitalize" style={{ color: '#8B7569' }}>
                              {slot.type === 'in_person' ? 'In-Person' : slot.type} · {slot.duration} min
                            </p>
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Contact info form */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 mb-8">
                <h3 className="text-2xl font-light mb-6" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
                  Your Contact Details
                </h3>
                <p className="text-gray-500 mb-6 text-base">
                  We&apos;ll send your consultation link and reminders to these contacts.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: '#1B2A5B' }}>Full Name *</label>
                    <input
                      type="text"
                      value={bookingData.name}
                      onChange={e => setBookingData({ ...bookingData, name: e.target.value })}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:border-[#1B2A5B] focus:ring-0 transition-colors"
                      placeholder="Your full name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: '#1B2A5B' }}>Email Address *</label>
                    <input
                      type="email"
                      value={bookingData.email}
                      onChange={e => setBookingData({ ...bookingData, email: e.target.value })}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:border-[#1B2A5B] focus:ring-0 transition-colors"
                      placeholder="you@email.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: '#1B2A5B' }}>Phone Number</label>
                    <input
                      type="tel"
                      value={bookingData.phone}
                      onChange={e => setBookingData({ ...bookingData, phone: e.target.value })}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:border-[#1B2A5B] focus:ring-0 transition-colors"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                </div>
              </div>

              {/* Confirm button */}
              <div className="text-center">
                <button
                  onClick={handleBooking}
                  disabled={!selectedSlotId || !bookingData.name || !bookingData.email}
                  className="text-white text-xl px-12 py-4 rounded-lg transition-all hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#C41E3A' }}
                >
                  Confirm Booking
                </button>
              </div>
            </>
          )}
        </main>
        <BottomNav />
      </div>
    );
  }

  // --- Booked Confirmation Stage ---
  if (stage === 'booked' && bookingResult) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#FAF7F2' }}>
        <header className="bg-white shadow-sm border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <h1 className="text-3xl font-light" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
                Booking Confirmed
              </h1>
              <a href="/" className="text-base hover:underline" style={{ color: '#1B2A5B' }}>
                Back to AWULA_K
              </a>
            </div>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pb-32">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6" style={{ backgroundColor: '#22C55E' }}>
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-4xl font-light mb-3" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
              You&apos;re All Set!
            </h2>
            <p className="text-xl text-gray-600">
              Your consultation has been booked successfully.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 mb-8">
            <h3 className="text-xl font-medium mb-6" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
              Booking Details
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-gray-100">
                <span className="text-gray-500">Date</span>
                <span className="font-medium" style={{ color: '#1B2A5B' }}>
                  {new Date(bookingResult.slot.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-gray-100">
                <span className="text-gray-500">Time</span>
                <span className="font-medium" style={{ color: '#1B2A5B' }}>
                  {bookingResult.slot.startTime} – {bookingResult.slot.endTime}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-gray-100">
                <span className="text-gray-500">Type</span>
                <span className="font-medium capitalize" style={{ color: '#1B2A5B' }}>
                  {bookingResult.slot.type === 'in_person' ? 'In-Person' : bookingResult.slot.type}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-gray-100">
                <span className="text-gray-500">Duration</span>
                <span className="font-medium" style={{ color: '#1B2A5B' }}>
                  {bookingResult.slot.duration} minutes
                </span>
              </div>
              {bookingResult.meetingLink && (
                <div className="flex justify-between items-center py-3">
                  <span className="text-gray-500">Meeting Link</span>
                  <a
                    href={bookingResult.meetingLink}
                    className="font-medium underline"
                    style={{ color: '#C41E3A' }}
                  >
                    Join Consultation
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl p-6 mb-8" style={{ backgroundColor: '#1B2A5B' }}>
            <h4 className="text-white font-medium text-lg mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
              What&apos;s Next?
            </h4>
            <ul className="text-white/80 space-y-2 text-base">
              <li>&#x2022; A confirmation has been sent to <strong className="text-white">{bookingResult.customerEmail}</strong></li>
              <li>&#x2022; You&apos;ll receive a reminder <strong className="text-white">24 hours</strong> and <strong className="text-white">1 hour</strong> before your consultation</li>
              <li>&#x2022; Use the meeting link above to join at the scheduled time</li>
              <li>&#x2022; Our stylist will have your AI analysis ready for a personalized session</li>
            </ul>
          </div>

          <div className="text-center space-y-4">
            <a
              href="/"
              className="inline-block text-white text-lg px-10 py-3 rounded-lg transition-all hover:shadow-lg"
              style={{ backgroundColor: '#1B2A5B' }}
            >
              Return Home
            </a>
            <div>
              <button
                onClick={() => { setStage('form'); setAnalysis(null); setBookingResult(null); setSelectedSlotId(''); setBookingData({ name: '', email: '', phone: '' }); }}
                className="text-base underline"
                style={{ color: '#1B2A5B' }}
              >
                Start a New Consultation
              </button>
            </div>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  // --- Form State (default) ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      {/* Luxury Header */}
      <header className="relative bg-white shadow-luxury border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-8">
              <h1 className="text-3xl font-light luxury-heading" style={{ fontFamily: 'var(--font-heading)' }}>AI Consultation Intake</h1>
              <nav className="hidden md:flex space-x-8">
                <a href="/" className="luxury-subheading hover:text-black transition-colors">&larr; Back to AWULA_K</a>
              </nav>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12 animate-fade-in-up">
          <h2 className="text-5xl font-light luxury-heading mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Tell Us Your Vision</h2>
          <p className="text-2xl text-gray-600 luxury-body max-w-2xl mx-auto">
            Our AI will analyze your preferences to prepare a personalized consultation experience.
            Every detail matters in crafting your perfect look.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8 animate-fade-in-up">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="card-luxury shadow-luxury-hover p-8 animate-slide-in-left">
              <label className="block text-xl font-medium luxury-heading mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Event Type</label>
              <select
                value={formData.eventType}
                onChange={(e) => setFormData({...formData, eventType: e.target.value})}
                className="w-full p-4 border border-gray-200 rounded-lg focus:border-gray-400 focus:ring-0 transition-colors luxury-body text-base"
                required
              >
                <option value="">Select your occasion</option>
                <option value="wedding">Wedding</option>
                <option value="bridal">Bridal Party</option>
                <option value="corporate">Corporate Event</option>
                <option value="party">Party/Social</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="card-luxury shadow-luxury-hover p-8 animate-slide-in-left" style={{ animationDelay: '0.1s' }}>
              <label className="block text-xl font-medium luxury-heading mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Event Date</label>
              <input
                type="date"
                value={formData.eventDate}
                onChange={(e) => setFormData({...formData, eventDate: e.target.value})}
                className="w-full p-4 border border-gray-200 rounded-lg focus:border-gray-400 focus:ring-0 transition-colors luxury-body text-base"
                required
              />
            </div>
          </div>

          <div className="card-luxury shadow-luxury-hover p-8 animate-fade-in-up">
            <label className="block text-xl font-medium luxury-heading mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Budget Range</label>
            <select
              value={formData.budget}
              onChange={(e) => setFormData({...formData, budget: e.target.value})}
              className="w-full p-4 border border-gray-200 rounded-lg focus:border-gray-400 focus:ring-0 transition-colors luxury-body text-base"
            >
              <option value="">Select your investment level</option>
              <option value="500-1000">$500 - $1,000</option>
              <option value="1000-2000">$1,000 - $2,000</option>
              <option value="2000-5000">$2,000 - $5,000</option>
              <option value="5000+">$5,000+</option>
            </select>
          </div>

          <div className="card-luxury shadow-luxury-hover p-8 animate-slide-in-left">
            <label className="block text-xl font-medium luxury-heading mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Style Preferences</label>
            <textarea
              value={formData.stylePreferences}
              onChange={(e) => setFormData({...formData, stylePreferences: e.target.value})}
              className="w-full p-4 border border-gray-200 rounded-lg focus:border-gray-400 focus:ring-0 transition-colors luxury-body resize-none text-base"
              placeholder="Describe your aesthetic vision - elegant, modern, traditional, bohemian, minimalist..."
              rows={4}
            />
          </div>

          <div className="card-luxury shadow-luxury-hover p-8 animate-slide-in-left" style={{ animationDelay: '0.1s' }}>
            <label className="block text-xl font-medium luxury-heading mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Body Type & Fit Goals</label>

            {/* Full-body photo alert */}
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[rgba(196,30,58,0.18)] bg-gradient-to-r from-[#FFF5F5] to-[#FDF8F2] p-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#C41E3A] text-white text-base">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" /></svg>
              </span>
              <div>
                <p className="text-sm font-semibold tracking-wide text-[#1B2A5B]">Please add a full-body photo below</p>
                <p className="mt-1 text-xs leading-5 text-[#5C3D2E]">A clear front-facing full-body picture helps us accurately determine your body type and create designs that flatter your unique silhouette. <strong className="text-[#C41E3A]">This is highly recommended for the best results.</strong></p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mb-6">
              {bodyProfiles.map((profile) => {
                const selected = selectedBodyProfile === profile.id;

                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelectedBodyProfile(profile.id)}
                    className={`rounded-[1.25rem] border p-4 text-left transition-all ${selected ? 'border-[#C41E3A] bg-[linear-gradient(180deg,rgba(196,30,58,0.08),rgba(255,255,255,0.96))] shadow-[0_18px_36px_rgba(196,30,58,0.12)]' : 'border-[rgba(27,42,91,0.1)] bg-[#FCFAF7] hover:border-[rgba(27,42,91,0.22)]'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <BodyProfileIcon selected={selected} profile={profile} />
                      <div className="flex-1">
                        <p className="text-sm font-semibold tracking-[0.08em] uppercase text-[#1B2A5B]">{profile.label}</p>
                        <p className="mt-2 text-sm leading-6 text-[#5C3D2E]">{profile.summary}</p>
                        <p className="mt-3 text-xs leading-5 uppercase tracking-[0.08em] text-[#8B7569]">{profile.fitCue}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <textarea
              value={formData.bodyType}
              onChange={(e) => setFormData({...formData, bodyType: e.target.value})}
              className="w-full p-4 border border-gray-200 rounded-lg focus:border-gray-400 focus:ring-0 transition-colors luxury-body resize-none text-base"
              placeholder="Share fit goals, comfort priorities, areas you love to highlight, or tailoring concerns..."
              rows={4}
            />
            <p className="mt-3 text-sm text-[#8B7569]">Choose the closest profile, then tell us what you want the garment to emphasize, soften, lengthen, or support.</p>

            {/* Body Photo Upload */}
            <div className="mt-6 rounded-[1.25rem] border border-dashed border-[rgba(196,30,58,0.25)] bg-[#FDF8F8] p-5">
              <div className="flex items-start gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[linear-gradient(145deg,#C41E3A,#E8364F)] text-white shadow-[0_16px_28px_rgba(196,30,58,0.22)]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </span>
                <div className="flex-1">
                  <p className="text-base font-semibold tracking-[0.06em] uppercase text-[#1B2A5B]">Upload Your Body Reference Photos</p>
                  <p className="mt-1 text-sm leading-6 text-[#5C3D2E]">Upload 1-2 full-body photos so our AI can visualize designs on your unique shape. Front and side angles work best. <strong className="text-[#1B2A5B]">Your photos are private and never shared.</strong></p>
                  <label className="mt-4 inline-flex cursor-pointer items-center rounded-full bg-[#C41E3A] px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#A3182F]">
                    Select Photos
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleBodyPhotoUpload} />
                  </label>
                  <p className="mt-3 text-xs uppercase tracking-[0.08em] text-[#8B7569]">JPEG, PNG, or WebP under 5 MB each &middot; Max 2 photos</p>
                </div>
              </div>

              {bodyPhotoError ? <p className="mt-4 text-sm text-[#C41E3A]">{bodyPhotoError}</p> : null}

              {bodyPhotoUploads.length > 0 && (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {bodyPhotoUploads.map((upload) => (
                    <div key={upload.id} className="overflow-hidden rounded-[1rem] border border-[rgba(196,30,58,0.15)] bg-white shadow-[0_14px_28px_rgba(27,42,91,0.08)]">
                      <img src={upload.dataUrl} alt={upload.name} className="h-52 w-full object-cover" />
                      <div className="p-4">
                        <p className="truncate text-sm font-semibold text-[#1B2A5B]">{upload.name}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-xs uppercase tracking-[0.08em] text-[#8B7569]">{upload.sizeLabel}</span>
                          <button type="button" onClick={() => removeBodyPhoto(upload.id)} className="text-xs font-semibold uppercase tracking-[0.08em] text-[#C41E3A]">
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="card-luxury shadow-luxury-hover p-8 animate-fade-in-up">
              <label className="block text-xl font-medium luxury-heading mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Preferred Colors</label>
              <input
                type="text"
                value={formData.colors}
                onChange={(e) => setFormData({...formData, colors: e.target.value})}
                className="w-full p-4 border border-gray-200 rounded-lg focus:border-gray-400 focus:ring-0 transition-colors luxury-body text-base"
                placeholder="navy, champagne, jewel tones, metallics..."
              />
            </div>

            <div className="card-luxury shadow-luxury-hover p-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              <label className="block text-xl font-medium luxury-heading mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Inspiration</label>
              <textarea
                value={formData.inspiration}
                onChange={(e) => setFormData({...formData, inspiration: e.target.value})}
                className="w-full p-4 border border-gray-200 rounded-lg focus:border-gray-400 focus:ring-0 transition-colors luxury-body resize-none text-base"
                placeholder="Share links, designers, or descriptions that inspire you..."
                rows={4}
              />
              <div className="mt-5 rounded-[1.25rem] border border-dashed border-[rgba(27,42,91,0.18)] bg-[#FCFAF7] p-5">
                <div className="flex items-start gap-4">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[linear-gradient(145deg,#1B2A5B,#2C3E7A)] text-white shadow-[0_16px_28px_rgba(27,42,91,0.22)]">
                    <UploadImageIcon className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="text-base font-semibold tracking-[0.06em] uppercase text-[#1B2A5B]">Upload inspiration photos</p>
                    <p className="mt-1 text-sm leading-6 text-[#5C3D2E]">Attach up to three images so the studio can see silhouettes, fabrics, or styling references alongside your written notes.</p>
                    <label className="mt-4 inline-flex cursor-pointer items-center rounded-full bg-[#1B2A5B] px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#0F1A3A]">
                      Select Images
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleInspirationUpload} />
                    </label>
                    <p className="mt-3 text-xs uppercase tracking-[0.08em] text-[#8B7569]">JPEG, PNG, or WebP under 5 MB each</p>
                  </div>
                </div>

                {uploadError ? <p className="mt-4 text-sm text-[#C41E3A]">{uploadError}</p> : null}

                {inspirationUploads.length ? (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {inspirationUploads.map((upload) => (
                      <div key={upload.id} className="overflow-hidden rounded-[1rem] border border-[rgba(27,42,91,0.08)] bg-white shadow-[0_14px_28px_rgba(27,42,91,0.08)]">
                        <img src={upload.dataUrl} alt={upload.name} className="h-44 w-full object-cover" />
                        <div className="p-4">
                          <p className="truncate text-sm font-semibold text-[#1B2A5B]">{upload.name}</p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-xs uppercase tracking-[0.08em] text-[#8B7569]">{upload.sizeLabel}</span>
                            <button type="button" onClick={() => removeInspirationUpload(upload.id)} className="text-xs font-semibold uppercase tracking-[0.08em] text-[#C41E3A]">
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="card-luxury shadow-luxury-hover p-8 animate-slide-in-left">
            <label className="block text-xl font-medium luxury-heading mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Special Notes</label>
            <textarea
              value={formData.specialNotes}
              onChange={(e) => setFormData({...formData, specialNotes: e.target.value})}
              className="w-full p-4 border border-gray-200 rounded-lg focus:border-gray-400 focus:ring-0 transition-colors luxury-body resize-none text-base"
              placeholder="Allergies, accessibility needs, cultural considerations, or other important details..."
              rows={4}
            />
          </div>

          <div className="text-center pt-10">
            <button
              type="submit"
              className="group"
              style={{
                background: 'linear-gradient(135deg, #1B2A5B 0%, #2D4A8C 50%, #1B2A5B 100%)',
                backgroundSize: '200% 200%',
                animation: 'btn-shimmer 3s ease-in-out infinite',
                color: '#FAF7F2',
                fontSize: '18px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                padding: '18px 48px',
                borderRadius: '50px',
                border: '2px solid rgba(212,165,116,0.4)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 6px 24px rgba(27,42,91,0.35)',
                transition: 'all 0.3s ease',
              }}
            >
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.15)',
                border: '1.5px solid rgba(255,255,255,0.3)',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </span>
              Begin AI Analysis &amp; Book Consultation
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'rgba(196,30,58,0.6)',
                fontSize: '14px',
              }}>
                &rarr;
              </span>
            </button>
            <p className="luxury-subheading text-gray-500 mt-5 text-sm">
              Your consultation will be scheduled within 24 hours
            </p>
            <style>{`
              @keyframes btn-shimmer {
                0%, 100% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
              }
              .group:hover {
                transform: translateY(-2px) scale(1.02);
                box-shadow: 0 10px 36px rgba(27,42,91,0.45), 0 0 20px rgba(196,30,58,0.2) !important;
              }
            `}</style>
          </div>
        </form>
      </main>

      <BottomNav />
    </div>
  );
}
