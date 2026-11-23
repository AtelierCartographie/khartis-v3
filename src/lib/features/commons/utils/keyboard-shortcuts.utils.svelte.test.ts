import { describe, expect, it } from 'vitest';
import { ToolbarStep, VisualizationTools } from '../types/global';
import {
  SINGLE_KEY_SHORTCUTS,
  resolveSingleKeyAction,
  splitShortcutKeys,
  type ShortcutLocale
} from './keyboard-shortcuts.utils';

const LOCALES: ShortcutLocale[] = ['fr', 'en'];

describe('single-key shortcuts', () => {
  it.each(LOCALES)('never reuse a letter within one step in %s', (locale) => {
    const steps = [
      ToolbarStep.Data,
      ToolbarStep.Visualizations,
      ToolbarStep.Styling
    ];

    for (const step of steps) {
      const reachable = SINGLE_KEY_SHORTCUTS.filter(
        (shortcut) => !('step' in shortcut) || shortcut.step === step
      ).map((shortcut) => shortcut.keys[locale]);

      expect(new Set(reachable).size).toBe(reachable.length);
    }
  });

  it('reads the tool letter of the interface language', () => {
    expect(
      resolveSingleKeyAction('c', 'fr', ToolbarStep.Visualizations)
    ).toEqual({ kind: 'tool', tool: VisualizationTools.Layers });
    expect(
      resolveSingleKeyAction('y', 'en', ToolbarStep.Visualizations)
    ).toEqual({ kind: 'tool', tool: VisualizationTools.Layers });
  });

  it('keeps tool letters inside their own step', () => {
    expect(resolveSingleKeyAction('c', 'fr', ToolbarStep.Data)).toBeUndefined();
    expect(resolveSingleKeyAction('f', 'fr', ToolbarStep.Data)).toBeUndefined();
  });
});

describe('splitShortcutKeys', () => {
  it('splits a shortcut label into keycaps', () => {
    expect(splitShortcutKeys('Ctrl+S')).toEqual(['Ctrl', 'S']);
    expect(splitShortcutKeys('⌘S')).toEqual(['⌘', 'S']);
    expect(splitShortcutKeys('C')).toEqual(['C']);
    expect(splitShortcutKeys('')).toEqual([]);
  });

  it('keeps the plus key of a zoom shortcut', () => {
    expect(splitShortcutKeys('⌘+')).toEqual(['⌘', '+']);
    expect(splitShortcutKeys('Ctrl++')).toEqual(['Ctrl', '+']);
    expect(splitShortcutKeys('Ctrl+-')).toEqual(['Ctrl', '-']);
  });
});
