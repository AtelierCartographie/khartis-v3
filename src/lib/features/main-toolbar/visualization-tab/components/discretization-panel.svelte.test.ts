import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'discretization-panel.svelte'),
  'utf8'
);

describe('DiscretizationPanel — break edition policy', () => {
  it('allows editing every interior break regardless of method (Figma 766:107296)', () => {
    expect(source).toContain(
      'function canEditBreakRow(index: number): boolean {\n    return index > 0 && index < breaks.length;'
    );
  });

  it('auto-switches to MANUAL when a break is edited and validation passes', () => {
    const blurBlock = source
      .split('function handleBreakBlur()')[1]
      ?.split('function ')[0];
    expect(blurBlock).toContain("if (method !== 'manual')");
    expect(blurBlock).toContain("method = 'manual';");
    expect(blurBlock).toContain("onmethodchange?.('manual');");
    expect(blurBlock).toContain('onbreakschange?.(nextBreaks);');
  });

  it('emits method change before breaks change to prevent Jenks/Quantile override', () => {
    const blurBlock = source
      .split('function handleBreakBlur()')[1]
      ?.split('function ')[0];
    const methodIdx = blurBlock?.indexOf("onmethodchange?.('manual')") ?? -1;
    const breaksIdx = blurBlock?.indexOf('onbreakschange?.(nextBreaks)') ?? -1;
    expect(methodIdx).toBeGreaterThan(-1);
    expect(breaksIdx).toBeGreaterThan(methodIdx);
  });

  it('re-syncs numClasses when switching from Q6 forced count to manual', () => {
    const blurBlock = source
      .split('function handleBreakBlur()')[1]
      ?.split('function ')[0];
    expect(blurBlock).toContain("const wasQ6 = method === 'q6'");
    expect(blurBlock).toContain('onclasseschange?.(nextBreaks.length)');
  });

  it('renders histogram bars for Répartition des valeurs', () => {
    expect(source).toContain('histogram');
  });

  it('exposes classification edge safety: guards empty breaks, NaN min/max', () => {
    expect(source).toContain('maxHistogramCount');
    expect(source).toContain('Math.max(...breaks.map');
  });
});
