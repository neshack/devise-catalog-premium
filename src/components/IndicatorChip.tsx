/**
 * The color signature of a volume: one or two swatches side by side.
 *
 * It is decorative: the control that owns it names the colors in text, so
 * screen readers get the meaning once instead of twice.
 */
export default function IndicatorChip({
  colors,
  className,
}: {
  colors: readonly string[];
  className?: string;
}) {
  const visible = colors.slice(0, 2);
  if (visible.length === 0) return null;
  return (
    <span className={`indicator-chip${className ? ` ${className}` : ""}`} aria-hidden="true">
      {visible.map((color, i) => (
        <span key={i} className="indicator-chip__cell" style={{ background: color }} />
      ))}
    </span>
  );
}
