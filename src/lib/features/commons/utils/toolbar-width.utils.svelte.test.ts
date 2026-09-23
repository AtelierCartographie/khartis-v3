import { describe, expect, it } from 'vitest';
import { ToolbarState } from '$lib/features/commons/types/global';
import {
  FULL_TOOLBAR_PANEL_WIDTH,
  MAIN_TOOLBAR_ID,
  TOOLBAR_WIDTHS,
  resolveToolbarPanelWidth,
  resolveToolbarPanelWidthFromClassName,
  resolveToolbarWidth
} from './toolbar-width.utils';

describe('toolbar width utils', () => {
  it('resolves the base toolbar offsets', () => {
    expect(MAIN_TOOLBAR_ID).toBe('khartis-main-toolbar');
    expect(TOOLBAR_WIDTHS[ToolbarState.Collapsed]).toBe('50px');
    expect(TOOLBAR_WIDTHS[ToolbarState.Compact]).toBe('var(--kh-panel-w)');
    expect(TOOLBAR_WIDTHS[ToolbarState.Full]).toBe('50vw');
    expect(resolveToolbarWidth(ToolbarState.Collapsed)).toBe('50px');
    expect(resolveToolbarWidth(ToolbarState.Compact)).toBe('var(--kh-panel-w)');
    expect(resolveToolbarWidth(ToolbarState.Full)).toBe('50vw');
  });

  it('uses the wide fallback for full toolbar panels', () => {
    expect(FULL_TOOLBAR_PANEL_WIDTH).toBe('clamp(400px, 50vw, 800px)');
    expect(resolveToolbarPanelWidth(ToolbarState.Collapsed)).toBe('50px');
    expect(resolveToolbarPanelWidth(ToolbarState.Compact)).toBe(
      'var(--kh-panel-w)'
    );
    expect(resolveToolbarPanelWidth(ToolbarState.Full)).toBe(
      FULL_TOOLBAR_PANEL_WIDTH
    );
  });

  it('preserves class-name fallback behavior for measured panels', () => {
    expect(resolveToolbarPanelWidthFromClassName('toolbar collapsed')).toBe(
      '50px'
    );
    expect(resolveToolbarPanelWidthFromClassName('toolbar full')).toBe(
      FULL_TOOLBAR_PANEL_WIDTH
    );
    expect(resolveToolbarPanelWidthFromClassName()).toBe('var(--kh-panel-w)');
  });
});
