type IconProps = {
  className?: string;
};

export function HomeNavIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 10.5 12 3.75l8.25 6.75" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 9.75v9a1.5 1.5 0 0 0 1.5 1.5h3.75v-6h3v6h3.75a1.5 1.5 0 0 0 1.5-1.5v-9" />
    </svg>
  );
}

export function OrdersNavIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75h15" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 6.75v-1.5A1.5 1.5 0 0 1 9 3.75h6a1.5 1.5 0 0 1 1.5 1.5v1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 6.75h13.5l-.92 10.16A1.5 1.5 0 0 1 16.33 18.3H7.67a1.5 1.5 0 0 1-1.5-1.39L5.25 6.75Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 10.5v3.75M14.25 10.5v3.75" />
    </svg>
  );
}

export function ConsultNavIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <rect x="3.75" y="6" width="11.25" height="12" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m15 10.12 4.28-2.38a.75.75 0 0 1 1.12.66v7.2a.75.75 0 0 1-1.12.66L15 13.88" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 10.5h3.75M7.5 13.5h3" />
    </svg>
  );
}

export function ProfileNavIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <circle cx="12" cy="8.25" r="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 19.5a6.75 6.75 0 0 1 13.5 0" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 19.5h16.5" />
    </svg>
  );
}

export function StudioNavIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 18.75h15" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15.75V9.75" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75V6.75" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 15.75v-3.5" />
      <circle cx="7.5" cy="8.25" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="5.25" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="10.75" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BespokeDesignIcon({ className = 'h-7 w-7' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 4.5 12 3l2.25 1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 4.5v3l-2.7 2.36a1.5 1.5 0 0 0-.51 1.13v6.76a1.5 1.5 0 0 0 1.5 1.5h7.92a1.5 1.5 0 0 0 1.5-1.5v-6.76a1.5 1.5 0 0 0-.51-1.13l-2.7-2.36v-3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.3 11.25c1.1.87 2.05 1.3 2.85 1.3s1.75-.43 2.85-1.3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.55v6.2" />
    </svg>
  );
}

export function VirtualStudioIcon({ className = 'h-7 w-7' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <rect x="3.75" y="6" width="12" height="11.25" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 9.56 3.72-2.07a.75.75 0 0 1 1.11.66v7.7a.75.75 0 0 1-1.11.66l-3.72-2.07" />
      <circle cx="9.75" cy="11.62" r="1.7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 15c.76-1.43 1.84-2.14 3.25-2.14 1.4 0 2.48.71 3.25 2.14" />
    </svg>
  );
}

export function PrecisionFitIcon({ className = 'h-7 w-7' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 8.25 7.5 5.25l3 3-3 3-3-3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m7.5 8.25 9-4.5 3 3-4.5 9-7.5 4.5-3-3 4.5-9Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 6.38 17.62 12.75" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.88 19.12 10.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15.75h.01M10.5 14.25h.01M12.75 12.75h.01" />
    </svg>
  );
}

export function UploadImageIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V5.25" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 9 3.75-3.75L15.75 9" />
      <rect x="3.75" y="13.5" width="16.5" height="6.75" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 17.25h7.5" />
    </svg>
  );
}