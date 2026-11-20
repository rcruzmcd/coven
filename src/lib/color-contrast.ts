/**
 * WCAG 2.1 contrast, shared by everything that has to choose a readable colour
 * against a tenant's own: the email shell's link and wordmark floors (#1238)
 * and the Gear Spotlight category pill's text (#1907). No imports, so either
 * caller can use it without pulling in the other's dependencies.
 */

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG 2.1's contrast ratio, 1 to 21. Both arguments must be `#rrggbb`. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a >= b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}
