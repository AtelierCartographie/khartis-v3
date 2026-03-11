import { describe, expect, it } from 'vitest';

import {
  DataSourceType,
  FileStatus,
  FileType
} from '$lib/features/commons/store/create-project.types';
import type { UploadedFile } from '$lib/features/commons/store/create-project.types';

import {
  convertToCSV,
  getArrayBuffer,
  getFileForDuckDB,
  isTabularData
} from '$lib/features/data-pipeline/processors/strategies/processor-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    id: 'f-1',
    name: 'data.csv',
    size: 100,
    type: 'text/csv',
    fileType: FileType.CSV,
    status: FileStatus.COMPLETE,
    sourceType: DataSourceType.FILE_UPLOAD,
    ...overrides
  } as UploadedFile;
}

// ---------------------------------------------------------------------------
// isTabularData
// ---------------------------------------------------------------------------

describe('processor-utils', () => {
  describe('isTabularData', () => {
    it("retourne true pour un tableau d'objets non vide", () => {
      expect(isTabularData([{ a: 1 }, { a: 2 }])).toBe(true);
    });

    it('retourne false pour un tableau vide', () => {
      expect(isTabularData([])).toBe(false);
    });

    it('retourne false pour un tableau de primitives', () => {
      expect(isTabularData([1, 2, 3])).toBe(false);
      expect(isTabularData(['a', 'b'])).toBe(false);
    });

    it('retourne false pour un tableau avec null', () => {
      expect(isTabularData([null])).toBe(false);
    });

    it('retourne false pour une valeur non-tableau', () => {
      expect(isTabularData(null)).toBe(false);
      expect(isTabularData(undefined)).toBe(false);
      expect(isTabularData('string')).toBe(false);
      expect(isTabularData(42)).toBe(false);
      expect(isTabularData({})).toBe(false);
    });

    it("retourne false quand un élément n'est pas un objet", () => {
      expect(isTabularData([{ a: 1 }, 'not-object'])).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // convertToCSV
  // ---------------------------------------------------------------------------

  describe('convertToCSV', () => {
    it('retourne une chaîne vide pour un tableau vide', () => {
      expect(convertToCSV([])).toBe('');
    });

    it("génère l'en-tête depuis les clés du premier objet", () => {
      const data = [{ col1: 'a', col2: 'b' }];
      const csv = convertToCSV(data);
      const lines = csv.split('\n');
      expect(lines[0]).toBe('col1,col2');
    });

    it('génère une ligne de données par objet', () => {
      const data = [
        { a: 1, b: 2 },
        { a: 3, b: 4 }
      ];
      const csv = convertToCSV(data);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(3); // header + 2 lignes
      expect(lines[1]).toBe('1,2');
      expect(lines[2]).toBe('3,4');
    });

    it('produit une chaîne vide pour une valeur null ou undefined', () => {
      const data = [{ a: null, b: undefined }];
      const csv = convertToCSV(data);
      const lines = csv.split('\n');
      expect(lines[1]).toBe(',');
    });

    it('entoure les valeurs contenant une virgule de guillemets', () => {
      const data = [{ col: 'valeur,avec,virgule' }];
      const csv = convertToCSV(data);
      const lines = csv.split('\n');
      expect(lines[1]).toBe('"valeur,avec,virgule"');
    });

    it('entoure les valeurs contenant un guillemet de guillemets et échappe le guillemet', () => {
      const data = [{ col: 'val"eur' }];
      const csv = convertToCSV(data);
      const lines = csv.split('\n');
      expect(lines[1]).toBe('"val""eur"');
    });

    it('entoure les valeurs contenant un saut de ligne de guillemets', () => {
      const data = [{ col: 'ligne1\nligne2' }];
      const csv = convertToCSV(data);
      const lines = csv.split('\n');
      // La valeur est entre guillemets (le saut de ligne interne l'ouvre sur plusieurs lignes CSV)
      expect(lines[1]).toContain('"');
    });

    it('ne casse pas les valeurs numériques', () => {
      const data = [{ value: 3.14 }];
      const csv = convertToCSV(data);
      const lines = csv.split('\n');
      expect(lines[1]).toBe('3.14');
    });
  });

  // ---------------------------------------------------------------------------
  // getFileForDuckDB
  // ---------------------------------------------------------------------------

  describe('getFileForDuckDB', () => {
    it('retourne originalFile si présent', () => {
      const original = new File(['content'], 'data.csv', { type: 'text/csv' });
      const file = makeFile({ originalFile: original });
      expect(getFileForDuckDB(file, 'text/csv')).toBe(original);
    });

    it('crée un File depuis ArrayBuffer si originalFile absent', () => {
      const buffer = new TextEncoder().encode('a,b\n1,2').buffer;
      const file = makeFile({ content: buffer });
      const result = getFileForDuckDB(file, 'text/csv');
      expect(result).toBeInstanceOf(File);
      expect(result.name).toBe('data.csv');
      expect(result.type).toBe('text/csv');
    });

    it('crée un File depuis string si originalFile absent', () => {
      const file = makeFile({ content: 'a,b\n1,2' });
      const result = getFileForDuckDB(file, 'text/csv');
      expect(result).toBeInstanceOf(File);
      expect(result.name).toBe('data.csv');
    });

    it('lève ParseError si ni originalFile ni content', () => {
      const file = makeFile({ content: undefined, originalFile: undefined });
      expect(() => getFileForDuckDB(file, 'text/csv')).toThrow(
        'Missing original file content for DuckDB ingestion'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getArrayBuffer
  // ---------------------------------------------------------------------------

  describe('getArrayBuffer', () => {
    it('retourne le buffer de originalFile si présent', async () => {
      const bytes = new Uint8Array([1, 2, 3]);
      const original = new File([bytes], 'data.bin');
      const file = makeFile({ originalFile: original });
      const result = await getArrayBuffer(file);
      expect(new Uint8Array(result)).toEqual(bytes);
    });

    it('retourne le content ArrayBuffer si originalFile absent', async () => {
      const buffer = new Uint8Array([4, 5, 6]).buffer;
      const file = makeFile({ content: buffer });
      const result = await getArrayBuffer(file);
      expect(result).toBe(buffer);
    });

    it('encode un content string en ArrayBuffer UTF-8', async () => {
      const file = makeFile({ content: 'abc' });
      const result = await getArrayBuffer(file);
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(new TextDecoder().decode(result)).toBe('abc');
    });

    it('lève ParseError si ni originalFile ni content', async () => {
      const file = makeFile({ content: undefined, originalFile: undefined });
      await expect(getArrayBuffer(file)).rejects.toThrow(
        'Missing file content for processing'
      );
    });
  });
});
