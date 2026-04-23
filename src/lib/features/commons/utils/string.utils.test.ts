import { describe, expect, it, vi } from 'vitest';
import { generateProjectFilename } from './string.utils';

describe('string utils', () => {
  it('generates project exports with the .kh extension by default', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-23T12:00:00Z'));

    expect(generateProjectFilename('My Project')).toBe(
      'my-project-2026-04-23.kh'
    );

    vi.useRealTimers();
  });
});
