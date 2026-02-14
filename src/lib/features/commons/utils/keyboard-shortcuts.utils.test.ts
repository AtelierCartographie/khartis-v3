import { describe, expect, it } from 'vitest';
import {
  detectApplePlatform,
  getSideNavShortcutLabels,
  getProjectShortcutPrefixLabel,
  hasAnyPrimaryModifier,
  hasPlatformPrimaryModifier,
  isShortcutCode,
  PROJECT_SHORTCUT_TIMEOUT_MS
} from './keyboard-shortcuts.utils';

describe('keyboard-shortcuts.utils', () => {
  describe('detectApplePlatform', () => {
    it('uses userAgentData platform when available', () => {
      expect(
        detectApplePlatform({
          platform: 'Win32',
          userAgentData: { platform: 'macOS' }
        })
      ).toBe(true);
    });

    it('falls back to navigator.platform for Apple environments', () => {
      expect(detectApplePlatform({ platform: 'MacIntel' })).toBe(true);
      expect(detectApplePlatform({ platform: 'iPhone' })).toBe(true);
    });

    it('returns false for non-Apple environments', () => {
      expect(detectApplePlatform({ platform: 'Win32' })).toBe(false);
      expect(detectApplePlatform({ platform: 'Linux x86_64' })).toBe(false);
    });
  });

  describe('getSideNavShortcutLabels', () => {
    it('formats Apple shortcut labels', () => {
      expect(getSideNavShortcutLabels(true)).toEqual({
        newProject: '⌃K N',
        openProject: '⌃K O',
        saveProject: '⌃K S',
        duplicateProject: '⌃K D',
        deleteProject: '⌃K X'
      });
    });

    it('formats non-Apple shortcut labels', () => {
      expect(getSideNavShortcutLabels(false)).toEqual({
        newProject: 'Ctrl+K N',
        openProject: 'Ctrl+K O',
        saveProject: 'Ctrl+K S',
        duplicateProject: 'Ctrl+K D',
        deleteProject: 'Ctrl+K X'
      });
    });
  });

  describe('key matching helpers', () => {
    it('matches shortcut key codes', () => {
      expect(isShortcutCode('KeyK', 'KeyK')).toBe(true);
      expect(isShortcutCode('KeyK', 'KeyN')).toBe(false);
    });

    it('exposes project shortcut prefix labels and timeout constant', () => {
      expect(getProjectShortcutPrefixLabel(true)).toBe('⌃K');
      expect(getProjectShortcutPrefixLabel(false)).toBe('Ctrl+K');
      expect(PROJECT_SHORTCUT_TIMEOUT_MS).toBe(2000);
    });

    it('detects any primary modifier on Ctrl or Meta', () => {
      expect(
        hasAnyPrimaryModifier({ ctrlKey: true, metaKey: false } as Pick<
          KeyboardEvent,
          'ctrlKey' | 'metaKey'
        >)
      ).toBe(true);
      expect(
        hasAnyPrimaryModifier({ ctrlKey: false, metaKey: true } as Pick<
          KeyboardEvent,
          'ctrlKey' | 'metaKey'
        >)
      ).toBe(true);
      expect(
        hasAnyPrimaryModifier({ ctrlKey: false, metaKey: false } as Pick<
          KeyboardEvent,
          'ctrlKey' | 'metaKey'
        >)
      ).toBe(false);
    });

    it('detects platform primary modifier', () => {
      expect(
        hasPlatformPrimaryModifier(
          { ctrlKey: false, metaKey: true } as Pick<
            KeyboardEvent,
            'ctrlKey' | 'metaKey'
          >,
          true
        )
      ).toBe(true);
      expect(
        hasPlatformPrimaryModifier(
          { ctrlKey: true, metaKey: false } as Pick<
            KeyboardEvent,
            'ctrlKey' | 'metaKey'
          >,
          true
        )
      ).toBe(false);
      expect(
        hasPlatformPrimaryModifier(
          { ctrlKey: true, metaKey: false } as Pick<
            KeyboardEvent,
            'ctrlKey' | 'metaKey'
          >,
          false
        )
      ).toBe(true);
      expect(
        hasPlatformPrimaryModifier(
          { ctrlKey: false, metaKey: true } as Pick<
            KeyboardEvent,
            'ctrlKey' | 'metaKey'
          >,
          false
        )
      ).toBe(false);
    });
  });
});
