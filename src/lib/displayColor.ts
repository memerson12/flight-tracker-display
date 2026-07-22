const HEX_COLOR = /^#([0-9a-f]{6})$/i;

const toHex = (value: number) => Math.round(value).toString(16).padStart(2, '0');

export const getDisplayAccent = (color: string) => {
  const match = color.match(HEX_COLOR);
  if (!match) return '#00BCEB';

  const red = Number.parseInt(match[1].slice(0, 2), 16);
  const green = Number.parseInt(match[1].slice(2, 4), 16);
  const blue = Number.parseInt(match[1].slice(4, 6), 16);
  const perceivedBrightness = Math.sqrt(
    (0.299 * red * red) + (0.587 * green * green) + (0.114 * blue * blue)
  );

  if (perceivedBrightness >= 125) return color.toUpperCase();

  const mixAmount = Math.min(0.48, Math.max(0.18, (138 - perceivedBrightness) / 220));
  return `#${toHex(red + ((255 - red) * mixAmount))}${toHex(green + ((255 - green) * mixAmount))}${toHex(blue + ((255 - blue) * mixAmount))}`.toUpperCase();
};
