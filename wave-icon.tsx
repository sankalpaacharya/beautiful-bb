// "bbb-wave": three accent bars rising in a wave (animated by effects.css),
// drawn on a working thread's sidebar row.
export function WaveIcon({ className }: { className?: string }) {
  return (
    <svg className={`bbb-wave-icon ${className ?? ""}`} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="3" width="3" height="10" rx="1.5" />
      <rect x="6.5" y="3" width="3" height="10" rx="1.5" />
      <rect x="11" y="3" width="3" height="10" rx="1.5" />
    </svg>
  );
}
