import { describe, expect, it } from 'vitest';

import { wrapLabelText, wrapLabelTextInTwoLines } from './label-wrap.utils';

// One unit per character keeps the expected lines readable.
const measure = (text: string): number => text.length;

describe('wrapLabelText', () => {
  it('should keep a label that fits on one line', () => {
    expect(wrapLabelText('Dieppe', 10, measure)).toEqual(['Dieppe']);
  });

  it('should break after a hyphen and keep the hyphen at the end of the line', () => {
    expect(wrapLabelText('Cherbourg-en-Cotentin', 14, measure)).toEqual([
      'Cherbourg-en-',
      'Cotentin'
    ]);
  });

  it('should fill each line with as many hyphenated parts as fit', () => {
    expect(wrapLabelText('Saint-Jacques-de-la-Lande', 17, measure)).toEqual([
      'Saint-Jacques-de-',
      'la-Lande'
    ]);
  });

  it('should break at spaces and drop the space', () => {
    expect(wrapLabelText("Bagnoles de l'Orne", 12, measure)).toEqual([
      'Bagnoles de',
      "l'Orne"
    ]);
  });

  it('should never cut inside a word too long for the width', () => {
    expect(wrapLabelText('Coudekerque-Branche', 9, measure)).toEqual([
      'Coudekerque-',
      'Branche'
    ]);
    expect(wrapLabelText('Anticonstitutionnellement', 10, measure)).toEqual([
      'Anticonstitutionnellement'
    ]);
  });

  it('should widen the previous line rather than leave three characters or fewer alone', () => {
    expect(wrapLabelText('Villeneuve-Loubet-sur-Mer', 22, measure)).toEqual([
      'Villeneuve-Loubet-sur-Mer'
    ]);
    expect(wrapLabelText('Saint-Lô', 6, measure)).toEqual(['Saint-Lô']);
  });

  it('should keep explicit line breaks', () => {
    expect(wrapLabelText('Paris\n2 100 000', 20, measure)).toEqual([
      'Paris',
      '2 100 000'
    ]);
  });
});

describe('wrapLabelTextInTwoLines', () => {
  it('should break where the two lines are closest in width', () => {
    expect(wrapLabelTextInTwoLines('Seine-Saint-Denis', measure)).toEqual([
      'Seine-',
      'Saint-Denis'
    ]);
    expect(wrapLabelTextInTwoLines('Alpes-de-Haute-Provence', measure)).toEqual(
      ['Alpes-de-', 'Haute-Provence']
    );
    expect(wrapLabelTextInTwoLines('Pyrénées Orientales', measure)).toEqual([
      'Pyrénées',
      'Orientales'
    ]);
  });

  it('should not break off a few letters or a single word', () => {
    expect(wrapLabelTextInTwoLines('Finistère', measure)).toBeNull();
    expect(wrapLabelTextInTwoLines('Le Mans', measure)).toBeNull();
  });
});
