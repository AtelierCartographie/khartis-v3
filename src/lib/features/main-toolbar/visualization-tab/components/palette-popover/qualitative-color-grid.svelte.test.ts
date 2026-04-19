import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'qualitative-color-grid.svelte'),
  'utf8'
);

describe('QualitativeColorGrid (themed 5-color row for Mixte/Chaud/Froid)', () => {
  it('should render a label above the color row', () => {
    expect(source).toContain('class="grid-label"');
    expect(source).toContain('{label}');
  });

  it('should use role="radiogroup" with radio children for the color row', () => {
    expect(source).toContain('role="radiogroup"');
    expect(source).toContain('role="radio"');
    expect(source).toContain('aria-checked={selectedColor === color}');
  });

  it('should emit onColorSelect with the clicked hex', () => {
    expect(source).toContain('onclick={() => onColorSelect?.(color)}');
  });

  it('should highlight the selected color with a 2px dark border and a checkmark', () => {
    expect(source).toContain('class:selected={selectedColor === color}');
    expect(source).toContain('{#if selectedColor === color}');
    expect(source).toContain('<Checkmark size={20}');
    expect(source).toContain('border-color: #012749');
  });
});
