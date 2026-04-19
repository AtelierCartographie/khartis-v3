import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'content-switcher.svelte'),
  'utf8'
);

describe('ContentSwitcher (Figma 1 couleur / 2 couleurs / Motifs)', () => {
  it('should render a tablist of tab-role buttons fed by the items prop', () => {
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain('{#each items as item, i (i)}');
  });

  it('should reflect active state via aria-selected and the active class', () => {
    expect(source).toContain('class:active={activeIndex === i}');
    expect(source).toContain('aria-selected={activeIndex === i}');
  });

  it('should emit onchange with the clicked index', () => {
    expect(source).toContain('onclick={() => onchange?.(i)}');
  });

  it('should render dividers between non-adjacent inactive tabs', () => {
    expect(source).toContain(
      '{#if i < items.length - 1 && activeIndex !== i && activeIndex !== i + 1}'
    );
    expect(source).toContain('class="switcher-divider"');
  });

  it('should style the active tab with the Figma #cac5c4 gray fill', () => {
    expect(source).toContain('background: #cac5c4');
    expect(source).toContain('color: #161616');
  });
});
