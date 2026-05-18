export type RequiredFallbackFont = 'arabic' | 'sc' | 'jp';

const DETECTORS: Record<RequiredFallbackFont, RegExp> = {
  arabic: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/,
  sc: /[\u4E00-\u9FFF\u3400-\u4DBF]/u,
  jp: /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\u{1B000}-\u{1B0FF}\u{1F200}]/u
};

export function detectRequiredFonts(text: string): Set<RequiredFallbackFont> {
  const result = new Set<RequiredFallbackFont>();
  for (const [font, regex] of Object.entries(DETECTORS)) {
    if (regex.test(text)) {
      result.add(font as RequiredFallbackFont);
    }
  }
  return result;
}

export function mergeRequiredFonts(
  a: Set<RequiredFallbackFont>,
  b: Set<RequiredFallbackFont>
): Set<RequiredFallbackFont> {
  return new Set([...a, ...b]);
}
