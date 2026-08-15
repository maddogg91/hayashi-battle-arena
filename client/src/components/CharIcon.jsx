// Character `img` values are almost always a plain emoji string, rendered
// directly as text. A few characters (e.g. Arisa) instead use a path to a
// custom icon asset — this renders whichever one applies, so call sites
// don't need to know or care which kind a given character has.
const IMAGE_PATH = /^(\/|https?:\/\/).*\.(png|svg|jpe?g|webp|gif)(\?.*)?$/i;

export default function CharIcon({ img, alt = "", sizePx = 32, className = "" }) {
  if (typeof img === "string" && IMAGE_PATH.test(img)) {
    // Explicit HTML width/height (not just a CSS class) so it's sized
    // correctly even if the stylesheet hasn't loaded yet, in addition to
    // the Tailwind sizing class for anywhere CSS is active.
    return (
      <img
        src={img}
        alt={alt}
        width={sizePx}
        height={sizePx}
        className={`inline-block object-contain ${className}`}
        style={{ width: sizePx, height: sizePx }}
      />
    );
  }
  return <span className={className}>{img}</span>;
}
