import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'symbol-mode-unique.svelte'),
  'utf8'
);

describe('SymbolModeUnique (aucun.png alignment)', () => {
  it('renders shape selector as Dropdown, not ToggleTabs', () => {
    expect(source).toContain('<Dropdown');
    expect(source).toContain('items={shapeDropdownItems}');
    expect(source).not.toContain('items={shapeItems}');
  });

  it('uses the shape label key for the Forme field', () => {
    expect(source).toContain('{m.shape()}');
  });

  it('binds the size slider to symbolSize limits', () => {
    expect(source).toContain('min={SLIDER_LIMITS.symbolSize.min}');
    expect(source).toContain('max={SLIDER_LIMITS.symbolSize.max}');
  });

  it('still exposes the background (Fond) section to match existing feature set', () => {
    expect(source).toContain('title={m.background()}');
  });
});
