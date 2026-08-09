// Single SVG icon component backed by the central path map. Inlining the
// path keeps the bundle small (no lucide-react dep) and matches the
// existing convention used inside AdminShell.

import { ICON_PATHS, type IconName } from './icons';

export interface IconProps {
  name: IconName;
  className?: string;
  strokeWidth?: number;
  size?: number;
  title?: string;
}

export default function Icon({
  name,
  className = 'w-5 h-5 shrink-0',
  strokeWidth = 1.5,
  size,
  title,
}: IconProps) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  const dimensionStyle = size ? { width: size, height: size } : undefined;
  return (
    <svg
      className={className}
      style={dimensionStyle}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {/* Some icon paths in the map contain a leading "M ... M ..." which
          is a multi-segment path. SVG handles that natively in a single d. */}
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}
