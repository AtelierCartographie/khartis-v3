import { describe, expect, it } from 'vitest';
import {
  isTextLikeColumnType,
  projectHtmlLikeText
} from './html-like-text.utils';

describe('projectHtmlLikeText', () => {
  it('strips HTML-like tags, decodes entities, and collapses whitespace', () => {
    expect(
      projectHtmlLikeText(
        '<center><table><tr><td>The Pit</td><td>Tras&nbsp;Street &amp; Co</td></tr></table></center>'
      )
    ).toBe('The Pit Tras Street & Co');
  });

  it('preserves plain text containing angle brackets when no HTML structure is detected', () => {
    expect(projectHtmlLikeText('temperature < 20 > 10')).toBe(
      'temperature < 20 > 10'
    );
  });

  it('returns the original string when only entity decoding does not materially change the value', () => {
    expect(projectHtmlLikeText('simple text')).toBe('simple text');
  });
});

describe('isTextLikeColumnType', () => {
  it('detects text-like column types case-insensitively', () => {
    expect(isTextLikeColumnType('TEXT')).toBe(true);
    expect(isTextLikeColumnType('character varying')).toBe(true);
    expect(isTextLikeColumnType('INTEGER')).toBe(false);
  });
});
