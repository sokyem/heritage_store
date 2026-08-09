// Skeleton primitives backed by the .aw-skeleton shimmer utility from
// admin.css. Used to replace the old `.loading-spinner` pattern with
// layout-preserving placeholders.

export function SkeletonBar({
  width = '100%',
  height = 12,
  className = '',
}: {
  width?: string | number;
  height?: string | number;
  className?: string;
}) {
  const style: React.CSSProperties = { width, height };
  return <span className={`aw-skeleton block ${className}`} style={style} />;
}

// Drop into a <tbody> while loading. Renders `count` rows of `cols`
// shimmer bars sized to roughly match a real data row.
export function SkeletonRow({
  cols,
  count = 6,
  cellPadding = 'px-4 py-4',
}: {
  cols: number;
  count?: number;
  cellPadding?: string;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, rowIdx) => (
        <tr
          key={rowIdx}
          className="border-b border-[color:var(--aw-border)] last:border-0"
        >
          {Array.from({ length: cols }).map((_, colIdx) => (
            <td key={colIdx} className={cellPadding}>
              <SkeletonBar
                height={12}
                width={`${50 + ((rowIdx * 13 + colIdx * 17) % 50)}%`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// Mirrors the StatCard layout while data loads. Used in the dashboard and
// snapshot pages' KPI rows.
export function SkeletonStat() {
  return (
    <div className="bg-[color:var(--aw-surface)] rounded-[var(--aw-radius-lg)] border border-[color:var(--aw-border)] shadow-[var(--aw-shadow-sm)] p-5">
      <SkeletonBar width="40%" height={10} className="mb-3" />
      <SkeletonBar width="60%" height={28} />
    </div>
  );
}

// Generic content card placeholder — three lines plus a small heading.
export function SkeletonBlock({
  className = '',
  lines = 4,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div
      className={`bg-[color:var(--aw-surface)] rounded-[var(--aw-radius-lg)] border border-[color:var(--aw-border)] shadow-[var(--aw-shadow-sm)] p-6 ${className}`}
    >
      <SkeletonBar width="35%" height={10} className="mb-5" />
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonBar
            key={i}
            height={12}
            width={`${65 + ((i * 23) % 30)}%`}
          />
        ))}
      </div>
    </div>
  );
}
