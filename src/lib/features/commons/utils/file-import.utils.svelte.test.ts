import { describe, expect, it } from 'vitest';
import { FileType } from '$lib/features/commons/types/create-project.types';
import {
  chunksContainPattern,
  extractDataFromPaste,
  isUtf8,
  transcodeLegacyTextToUtf8
} from './file-import.utils';

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

  it('should find a pattern when it straddles two chunks', async () => {
    const found = await chunksContainPattern(
      ['<Placemark><Exten', 'dedData><Data name="pop">'],
      /<ExtendedData\b/
    );

    expect(found).toBe(true);
  });

  it('should not find a pattern absent from every chunk', async () => {
    const found = await chunksContainPattern(
      ['<Placemark><Name>a</Name>', '</Placemark>'],
      /<ExtendedData\b/
    );

    expect(found).toBe(false);
  });

  it('should transcode a Windows-1252 CSV to UTF-8 when its bytes are not UTF-8', async () => {
    // "Finlândia;Seychelles – RSF" as written by a Windows export
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('Finl'),
      0xe2,
      ...new TextEncoder().encode('ndia;Seychelles '),
      0x96,
      ...new TextEncoder().encode(' RSF')
    ]);
    const legacy = new File([bytes], 'rsf.csv', { lastModified: 42 });

    expect(await isUtf8(legacy)).toBe(false);

    const utf8 = await transcodeLegacyTextToUtf8(legacy);

    expect(await isUtf8(utf8)).toBe(true);
    expect(await utf8.text()).toBe('Finlândia;Seychelles – RSF');
    expect(utf8.name).toBe('rsf.csv');
    expect(utf8.lastModified).toBe(42);
  });

  it('should accept a UTF-8 file when it holds accented and Arabic text', async () => {
    const file = new File(
      ['Est\u00f4nia;\u0641\u0646\u0644\u0646\u062f\u0627'],
      'a.csv'
    );

    expect(await isUtf8(file)).toBe(true);
  });
});
