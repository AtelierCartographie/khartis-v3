import type { IParser } from '../../domain/interfaces/parser.interface';
import { ParserError } from '../../domain/interfaces/parser.interface';
import type { RawDataset } from '../../domain/entities/raw-dataset.entity';

/**
 * Shapefile Parser - Parses Shapefiles (currently placeholder)
 *
 * Shapefiles require multiple files (.shp, .shx, .dbf, .prj).
 * For now, we delegate to DuckDB's native ST_Read which handles this.
 *
 * TODO: Implement proper shapefile parsing if needed
 *
 * @example
 * ```typescript
 * const parser = new ShapefileParser();
 * if (parser.canParse(file)) {
 *   const dataset = await parser.parse(file);
 * }
 * ```
 */
export class ShapefileParser implements IParser {
  readonly supportedExtensions = ['.shp', '.zip'];

  readonly mimeTypes = ['application/x-shapefile', 'application/zip'];

  canParse(file: File): boolean {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    return this.supportedExtensions.includes(ext);
  }

  async parse(_file: File): Promise<RawDataset> {
    // For now, throw error - shapefiles should be handled by DuckDB ST_Read
    throw new ParserError(
      'Shapefile parsing not yet implemented. Use DuckDB ST_Read directly.',
      undefined,
      'shapefile'
    );

    // TODO: Implement shapefile parsing using shapefile.js or similar
    // This would involve:
    // 1. Check if it's a .zip (extract .shp, .shx, .dbf, .prj)
    // 2. Parse .shp for geometry
    // 3. Parse .dbf for attributes
    // 4. Parse .prj for CRS
    // 5. Combine into RawDataset
  }
}
