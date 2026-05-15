import { describe, expect, it } from 'vitest';
import { FileType } from '$lib/features/commons/types/create-project.types';
import { extractDataFromPaste } from './file-import.utils';

describe('file import utils', () => {
  it('preserves an empty final pasted cell instead of dropping the last delimiter', () => {
    const pasted = [
      'Pays\tNum',
      'France\t10000',
      'Allemagne\t5555',
      'Suisse\t'
    ].join('\n');

    const result = extractDataFromPaste(pasted);

    expect(result).toEqual({
      fileType: FileType.TSV,
      content: pasted
    });
  });

  it('removes outer line breaks without trimming empty tabular cells', () => {
    const result = extractDataFromPaste('\nPays,Num\nFrance,10000\nSuisse,\n');

    expect(result).toEqual({
      fileType: FileType.CSV,
      content: 'Pays,Num\nFrance,10000\nSuisse,'
    });
  });
});
