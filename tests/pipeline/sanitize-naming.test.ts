import { describe, expect, it } from 'vitest';
import {
  escapeIdentifier,
  escapeSqlString,
  sanitizeProjectName,
  sanitizeTextInput
} from '$lib/features/commons/utils/sanitize.utils';
import { generateUniqueNameWithCounter } from '$lib/features/commons/utils/naming.utils';

describe('sanitizeProjectName', () => {
  it('preserves a normal name', () => {
    expect(sanitizeProjectName('My Project')).toBe('My Project');
  });

  it('removes forbidden filename characters', () => {
    const name = 'bad<>:"/\\|?*chars';
    const result = sanitizeProjectName(name);
    expect(result).not.toMatch(/[<>:"/\\|?*]/);
  });

  it('collapses internal whitespace', () => {
    expect(sanitizeProjectName('foo   bar')).toBe('foo bar');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeProjectName('  hello  ')).toBe('hello');
  });

  it('truncates to 255 characters', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeProjectName(long).length).toBeLessThanOrEqual(255);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeProjectName('')).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeProjectName(null as unknown as string)).toBe('');
  });
});

describe('sanitizeTextInput', () => {
  it('collapses whitespace and trims', () => {
    expect(sanitizeTextInput('  hello   world  ')).toBe('hello world');
  });

  it('can preserve spaces without trimming while typing', () => {
    expect(sanitizeTextInput('  hello   world  ', { trim: false })).toBe(
      '  hello   world  '
    );
  });

  it('truncates to 500 characters', () => {
    const long = 'x'.repeat(600);
    expect(sanitizeTextInput(long).length).toBeLessThanOrEqual(500);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeTextInput('')).toBe('');
  });
});

describe('escapeSqlString', () => {
  it('escapes single quotes with doubled single quotes', () => {
    expect(escapeSqlString("O'Brien")).toBe("O''Brien");
  });

  it('leaves strings without single quotes unchanged', () => {
    expect(escapeSqlString('hello')).toBe('hello');
  });

  it('escapes multiple single quotes', () => {
    expect(escapeSqlString("it's a test's value")).toBe(
      "it''s a test''s value"
    );
  });

  it('handles empty string', () => {
    expect(escapeSqlString('')).toBe('');
  });
});

describe('escapeIdentifier', () => {
  it('escapes double quotes with doubled double quotes', () => {
    expect(escapeIdentifier('my"column')).toBe('my""column');
  });

  it('leaves identifiers without double quotes unchanged', () => {
    expect(escapeIdentifier('my_column')).toBe('my_column');
  });

  it('escapes multiple double quotes', () => {
    expect(escapeIdentifier('"quoted"')).toBe('""quoted""');
  });

  it('handles empty string', () => {
    expect(escapeIdentifier('')).toBe('');
  });
});

describe('generateUniqueNameWithCounter', () => {
  it('returns base name when no existing names', () => {
    expect(generateUniqueNameWithCounter('Map', [])).toBe('Map');
  });

  it('returns base name when no collision', () => {
    expect(generateUniqueNameWithCounter('Map', ['Other'])).toBe('Map');
  });

  it('appends (1) on exact match', () => {
    expect(generateUniqueNameWithCounter('Map', ['Map'])).toBe('Map (1)');
  });

  it('is case-insensitive for collision detection', () => {
    expect(generateUniqueNameWithCounter('map', ['Map'])).toBe('map (1)');
  });

  it('increments past existing counters', () => {
    expect(generateUniqueNameWithCounter('Map', ['Map', 'Map (1)'])).toBe(
      'Map (2)'
    );
  });

  it('finds max counter and adds 1', () => {
    expect(generateUniqueNameWithCounter('Map', ['Map (1)', 'Map (3)'])).toBe(
      'Map (4)'
    );
  });

  it('strips existing counter from input before resolving', () => {
    const result = generateUniqueNameWithCounter('Map (1)', ['Map (1)']);
    expect(result).toBe('Map (2)');
  });
});
