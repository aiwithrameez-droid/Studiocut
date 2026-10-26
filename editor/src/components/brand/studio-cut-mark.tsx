type StudioCutMarkProps = { className?: string; label?: string };

/** Signal Cut mark: an open frame split by a lime cut line, with a sky-blue play signal. */
export function StudioCutMark({ className = 'size-9', label }: StudioCutMarkProps) {
  return (
    <span
      className={`studiocut-mark grid shrink-0 place-items-center rounded-[28%] ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="12 10 56 58" className="size-[78%]" focusable="false">
        <path d="M60 59H20V19.6h40V32h-4v-8.4H24V55h32v-8.8h4z" fill="#E8EEF4" />
        <path className="studiocut-mark-cut" d="M38 14h4.1v50.9H38z" fill="#B4C406" />
        <path className="studiocut-mark-play" d="M56.1 33.3V45l9.3-5.9z" fill="#65C6E9" />
      </svg>
    </span>
  );
}
