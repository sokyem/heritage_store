'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const CONSULTATION_TYPES = [
  {
    id: 'virtual-studio',
    label: 'Virtual Studio',
    duration: '45 min',
    description: 'Live video session to discuss your vision, style goals, and custom design options.',
    icon: '🎥',
  },
  {
    id: 'in-person-fitting',
    label: 'In-Person Fitting',
    duration: '60 min',
    description: 'Visit our atelier for hands-on fitting, precise measurements, and fabric selection.',
    icon: '📐',
  },
  {
    id: 'design-consultation',
    label: 'Design Consultation',
    duration: '60 min',
    description: 'Deep-dive into your custom design — silhouettes, fabrics, embellishments, and timeline.',
    icon: '✏️',
  },
  {
    id: 'styling-session',
    label: 'Styling Session',
    duration: '30 min',
    description: 'Focused session on styling, accessorizing, and completing your look.',
    icon: '✨',
  },
] as const;

type ConsultationType = (typeof CONSULTATION_TYPES)[number]['id'];

// Generate the next 14 available weekdays starting from tomorrow
function getAvailableDates(): { value: string; label: string }[] {
  const dates: { value: string; label: string }[] = [];
  const today = new Date();
  let cursor = new Date(today);
  cursor.setDate(cursor.getDate() + 1);

  while (dates.length < 14) {
    const day = cursor.getDay();
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (day !== 0 && day !== 6) {
      dates.push({
        value: cursor.toISOString().split('T')[0],
        label: cursor.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

const TIME_SLOTS = [
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
];

export default function ConsultationBookingPanel() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<ConsultationType>('virtual-studio');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [error, setError] = useState('');

  const availableDates = getAvailableDates();

  const handleBookNow = () => {
    if (!selectedDate) {
      setError('Please select a date.');
      return;
    }
    if (!selectedTime) {
      setError('Please select a time.');
      return;
    }
    setError('');

    const params = new URLSearchParams({
      date: selectedDate,
      time: selectedTime,
      type: selectedType,
    });

    router.push(`/consultations/checkout?${params.toString()}`);
  };

  return (
    <section
      className="border-b border-[rgba(27,42,91,0.08)]"
      style={{ backgroundColor: '#FAF7F2' }}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        {/* Heading */}
        <div className="text-center mb-10">
          <span className="inline-block text-xs font-bold uppercase tracking-[0.18em] text-[#C41E3A] mb-3">
            Book a Session
          </span>
          <h2
            className="text-4xl font-light mb-3"
            style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}
          >
            Schedule Your Consultation
          </h2>
          <p className="text-base text-[#8B7569] max-w-xl mx-auto">
            Choose a session type, pick a date and time, and book instantly.{' '}
            <strong className="text-[#1B2A5B]">Consultations are $40 per session.</strong>
          </p>
        </div>

        {/* Consultation type grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {CONSULTATION_TYPES.map((type) => {
            const isSelected = selectedType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => setSelectedType(type.id)}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  isSelected
                    ? 'border-[#1B2A5B] bg-[#1B2A5B] shadow-lg'
                    : 'border-[rgba(27,42,91,0.12)] bg-white hover:border-[#1B2A5B]/40'
                }`}
              >
                <span className="text-2xl mb-2 block">{type.icon}</span>
                <p
                  className={`text-sm font-semibold leading-snug mb-1 ${
                    isSelected ? 'text-white' : 'text-[#1B2A5B]'
                  }`}
                >
                  {type.label}
                </p>
                <p
                  className={`text-xs ${
                    isSelected ? 'text-white/70' : 'text-[#8B7569]'
                  }`}
                >
                  {type.duration}
                </p>
              </button>
            );
          })}
        </div>

        {/* Date & time selectors */}
        <div className="bg-white rounded-2xl border border-[rgba(27,42,91,0.08)] p-6 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Date */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#8B7569] mb-3">
                Select a Date
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {availableDates.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => { setSelectedDate(d.value); setError(''); }}
                    className={`rounded-lg border py-2 px-1 text-center text-xs font-medium transition-all ${
                      selectedDate === d.value
                        ? 'border-[#C41E3A] bg-[#C41E3A] text-white shadow-md'
                        : 'border-[#E5E7EB] text-[#1B2A5B] hover:border-[#C41E3A]/50'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#8B7569] mb-3">
                Select a Time
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TIME_SLOTS.map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => { setSelectedTime(time); setError(''); }}
                    className={`rounded-lg border py-2.5 text-sm font-medium transition-all ${
                      selectedTime === time
                        ? 'border-[#C41E3A] bg-[#C41E3A] text-white shadow-md'
                        : 'border-[#E5E7EB] text-[#1B2A5B] hover:border-[#C41E3A]/50'
                    }`}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-[#C41E3A] text-center mb-4">{error}</p>
        )}

        {/* Selected summary + CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#1B2A5B] rounded-2xl px-6 py-5">
          <div className="text-white text-sm">
            {selectedDate && selectedTime ? (
              <>
                <span className="text-white/60 text-xs uppercase tracking-wider block mb-0.5">
                  Your selection
                </span>
                <span className="font-semibold">
                  {CONSULTATION_TYPES.find((t) => t.id === selectedType)?.label}
                </span>
                {' · '}
                <span>
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                {' at '}
                <span>{selectedTime}</span>
              </>
            ) : (
              <span className="text-white/60">Select a date and time above to continue</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleBookNow}
            className="flex-shrink-0 px-8 py-3 rounded-xl text-sm font-bold uppercase tracking-[0.08em] transition-all hover:shadow-lg"
            style={{ backgroundColor: '#C41E3A', color: '#fff' }}
          >
            Book Now →
          </button>
        </div>

        {/* Pricing note */}
        <p className="text-center text-xs text-[#8B7569] mt-4">
          $40 per consultation · Secure checkout · No commitment required
        </p>
      </div>
    </section>
  );
}
