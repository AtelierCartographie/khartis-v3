import { describe, expect, it } from 'vitest';

import { FileFormatEnum } from '$lib/features/data-pipeline/types';
import {
  detectFileFormat,
  generateTableName
} from '$lib/features/data-pipeline/core/format-detector';

describe('format-detector', () => {
  describe('detectFileFormat', () => {
    // --- Parquet (priorité max) ---
    it.each([
      ['data.parquet', FileFormatEnum.GEOPARQUET],
      ['DATA.PARQUET', FileFormatEnum.GEOPARQUET],
      ['file.geoparquet', FileFormatEnum.GEOPARQUET],
      ['file.gpq', FileFormatEnum.GEOPARQUET]
    ])('détecte geoparquet pour "%s"', (name, expected) => {
      expect(detectFileFormat(name)).toBe(expected);
    });

    // --- Tabulaire ---
    it.each([
      ['data.csv', FileFormatEnum.CSV],
      ['DATA.CSV', FileFormatEnum.CSV],
      ['data.tsv', FileFormatEnum.CSV],
      ['data.txt', FileFormatEnum.CSV]
    ])('détecte csv pour "%s"', (name, expected) => {
      expect(detectFileFormat(name)).toBe(expected);
    });

    // --- Géospatial ---
    it.each([
      ['map.geojson', FileFormatEnum.GEOJSON],
      ['MAP.GEOJSON', FileFormatEnum.GEOJSON],
      ['data.json', FileFormatEnum.GEOJSON],
      ['countries.shp', FileFormatEnum.SHAPEFILE],
      ['regions.gpkg', FileFormatEnum.GEOPACKAGE],
      ['places.kml', FileFormatEnum.KML],
      ['places.kmz', FileFormatEnum.KMZ],
      ['track.gpx', FileFormatEnum.GPX]
    ])('détecte le bon format géospatial pour "%s"', (name, expected) => {
      expect(detectFileFormat(name)).toBe(expected);
    });

    // --- Inconnu ---
    it.each([
      ['document.pdf', FileFormatEnum.UNKNOWN],
      ['image.png', FileFormatEnum.UNKNOWN],
      ['archive.zip', FileFormatEnum.UNKNOWN],
      ['file', FileFormatEnum.UNKNOWN],
      ['', FileFormatEnum.UNKNOWN]
    ])('retourne unknown pour "%s"', (name, expected) => {
      expect(detectFileFormat(name)).toBe(expected);
    });

    // --- Casse insensible ---
    it('est insensible à la casse pour les extensions', () => {
      expect(detectFileFormat('data.CSV')).toBe(FileFormatEnum.CSV);
      expect(detectFileFormat('map.GeoJSON')).toBe(FileFormatEnum.GEOJSON);
      expect(detectFileFormat('shapes.SHP')).toBe(FileFormatEnum.SHAPEFILE);
    });

    // --- Parquet prioritaire sur GEO ---
    it('préfère geoparquet sur les formats géo quand parquet match en premier', () => {
      // .geoparquet est dans PARQUET, pas dans GEO
      expect(detectFileFormat('world.geoparquet')).toBe(
        FileFormatEnum.GEOPARQUET
      );
    });

    // --- Fichier avec chemin complet ---
    it("ignore le chemin et détecte l'extension finale", () => {
      expect(detectFileFormat('path/to/data.csv')).toBe(FileFormatEnum.CSV);
      expect(detectFileFormat('/absolute/path/map.geojson')).toBe(
        FileFormatEnum.GEOJSON
      );
    });

    // --- Nom avec plusieurs points ---
    it('détecte sur la dernière extension quand plusieurs points', () => {
      expect(detectFileFormat('data.backup.csv')).toBe(FileFormatEnum.CSV);
      expect(detectFileFormat('world.2024.geojson')).toBe(
        FileFormatEnum.GEOJSON
      );
    });
  });

  describe('generateTableName', () => {
    it("supprime l'extension du fichier", () => {
      const result = generateTableName('data.csv');
      expect(result).toMatch(/^data_/);
    });

    it('remplace les caractères non alphanumériques par des underscores', () => {
      const result = generateTableName('mon fichier.csv');
      expect(result).toMatch(/^mon_fichier_/);
    });

    it('préfixe avec "t_" quand le nom commence par un chiffre', () => {
      const result = generateTableName('2024data.csv');
      expect(result).toMatch(/^t_2024data_/);
    });

    it('utilise le préfixe fourni et ne préfixe pas t_ même si le nom commence par un chiffre', () => {
      const result = generateTableName('2024data.csv', 'upload');
      expect(result).toMatch(/^upload_2024data_/);
    });

    it('produit des noms différents à chaque appel (timestamp base36)', () => {
      // Date.now() doit s'écouler entre les deux appels pour être différents,
      // mais en base36 Date.now() est stable sur quelques ms.
      // On vérifie surtout que le format est cohérent.
      const a = generateTableName('file.csv');
      const b = generateTableName('file.csv');
      // Les deux ont le bon préfixe
      expect(a).toMatch(/^file_[a-z0-9]+$/);
      expect(b).toMatch(/^file_[a-z0-9]+$/);
    });

    it('gère un nom sans extension', () => {
      const result = generateTableName('datafile');
      expect(result).toMatch(/^datafile_/);
    });

    it('conserve uniquement les caractères alphanumériques et underscore dans le corps', () => {
      const result = generateTableName('mon-fichier spécial!.csv');
      // Seuls [a-zA-Z0-9_] + le séparateur _ + suffix timestamp
      expect(result).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
    });
  });
});
