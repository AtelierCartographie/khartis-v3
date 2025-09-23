import { logger } from './logger.utils';
import type { FileValidation } from '../store/create-project.types';
import { FileType } from '../store/create-project.types';

export interface FileValidationConfig {
  maxFileSize: number;
  maxTotalSize: number;
  maxFileCount: number;
  allowedExtensions: string[];
  allowedMimeTypes: string[];
  strictMode: boolean;
}

export interface DetailedValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fileType: FileType;
  requiresAsyncValidation: boolean;
  metadata?: {
    detectedType?: string;
    actualMimeType?: string;
    magicNumber?: string;
    encoding?: string;
  };
}

// Configuration unifiée selon CDC et bonnes pratiques
export const FILE_VALIDATION_CONFIG: FileValidationConfig = {
  maxFileSize: 50 * 1024 * 1024, // 50 MB par fichier (unifié)
  maxTotalSize: 100 * 1024 * 1024, // 100 MB total
  maxFileCount: 20, // Maximum 20 fichiers à la fois
  allowedExtensions: [
    // Données tabulaires
    'csv', 'tsv', 'txt',
    // Données géographiques
    'geojson', 'json',
    // Shapefile components
    'shp', 'shx', 'dbf', 'prj', 'cpg', 'sbn', 'sbx',
    // GeoPackage
    'gpkg',
    // KML (bonus)
    'kml', 'kmz'
  ],
  allowedMimeTypes: [
    // CSV
    'text/csv',
    'application/csv',
    'text/plain',
    'text/tab-separated-values',
    // JSON/GeoJSON
    'application/json',
    'application/geo+json',
    'application/vnd.geo+json',
    // Shapefile
    'application/x-shapefile',
    'application/x-dbf',
    'application/octet-stream',
    // GeoPackage
    'application/geopackage+sqlite3',
    'application/x-sqlite3',
    // KML
    'application/vnd.google-earth.kml+xml',
    'application/vnd.google-earth.kmz'
  ],
  strictMode: true
};

// Magic numbers pour détecter le type réel des fichiers
const FILE_SIGNATURES = {
  // SQLite/GeoPackage
  SQLITE: [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65],
  // Shapefile
  SHP: [0x00, 0x00, 0x27, 0x0A],
  DBF: [0x03],
  // ZIP (pour KMZ)
  ZIP: [0x50, 0x4B, 0x03, 0x04],
  // GeoJSON/JSON (commence par { ou [)
  JSON: [0x7B, 0x5B],
  // CSV/TSV (pas de signature, vérification du contenu)
  TEXT: null
};

export class FileValidator {
  private static config = FILE_VALIDATION_CONFIG;

  /**
   * Validation principale synchrone
   */
  static validate(file: File): DetailedValidationResult {
    const result: DetailedValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fileType: FileType.UNKNOWN,
      requiresAsyncValidation: false,
      metadata: {}
    };

    // Validation de base
    this.validateBasicProperties(file, result);

    // Détection du type de fichier
    result.fileType = this.detectFileType(file);
    result.metadata!.detectedType = FileType[result.fileType];

    // Validation spécifique au type
    this.validateByType(file, result);

    // Déterminer si validation async nécessaire
    result.requiresAsyncValidation = this.requiresAsyncValidation(result.fileType);

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * Validation asynchrone pour les formats complexes
   */
  static async validateAsync(file: File, initialResult: DetailedValidationResult): Promise<DetailedValidationResult> {
    const result = { ...initialResult };

    try {
      // Lire les premiers octets pour vérifier la signature
      const buffer = await this.readFileHeader(file, 512);
      result.metadata!.magicNumber = this.getMagicNumber(buffer);

      // Validation spécifique selon le type
      switch (result.fileType) {
        case FileType.CSV:
        case FileType.TSV:
          await this.validateCSVContent(file, buffer, result);
          break;

        case FileType.GEOJSON:
          await this.validateGeoJSONContent(file, buffer, result);
          break;

        case FileType.SHAPEFILE:
          await this.validateShapefileContent(file, buffer, result);
          break;

        case FileType.GEOPACKAGE:
          await this.validateGeoPackageContent(file, buffer, result);
          break;
      }
    } catch (error) {
      logger.error('Async validation failed', error);
      result.errors.push('Impossible de valider le contenu du fichier');
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validation groupée pour plusieurs fichiers
   */
  static validateMultiple(files: File[]): {
    results: Map<string, DetailedValidationResult>;
    globalErrors: string[];
    isValid: boolean;
  } {
    const results = new Map<string, DetailedValidationResult>();
    const globalErrors: string[] = [];
    let totalSize = 0;

    // Vérifications globales
    if (files.length > this.config.maxFileCount) {
      globalErrors.push(`Nombre maximum de fichiers dépassé (${this.config.maxFileCount})`);
    }

    // Validation individuelle
    for (const file of files) {
      const result = this.validate(file);
      results.set(file.name, result);
      totalSize += file.size;
    }

    // Vérification taille totale
    if (totalSize > this.config.maxTotalSize) {
      globalErrors.push(
        `Taille totale des fichiers dépasse ${this.config.maxTotalSize / (1024 * 1024)} MB`
      );
    }

    // Détection des Shapefiles
    this.validateShapefileGroup(files, results, globalErrors);

    return {
      results,
      globalErrors,
      isValid: globalErrors.length === 0 && Array.from(results.values()).every(r => r.isValid)
    };
  }

  private static validateBasicProperties(file: File, result: DetailedValidationResult): void {
    // Vérification taille
    if (file.size === 0) {
      result.errors.push('Le fichier est vide');
    } else if (file.size > this.config.maxFileSize) {
      result.errors.push(
        `Le fichier dépasse la limite de ${this.config.maxFileSize / (1024 * 1024)} MB`
      );
    } else if (file.size > this.config.maxFileSize * 0.8) {
      result.warnings.push('Fichier volumineux, le traitement pourrait être lent');
    }

    // Vérification nom de fichier
    if (!file.name || file.name.length === 0) {
      result.errors.push('Nom de fichier invalide');
    }

    // Détection de caractères suspects dans le nom
    const suspiciousPatterns = [
      /\.\./,  // Path traversal
      /[<>:"|?*\\]/,  // Caractères invalides Windows
      /[\x00-\x1f\x7f]/,  // Caractères de contrôle
      /^\./, // Fichiers cachés Unix
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(file.name)) {
        result.warnings.push('Le nom du fichier contient des caractères inhabituels');
        break;
      }
    }

    // Vérification extension
    const extension = this.getFileExtension(file.name);
    if (!extension) {
      result.warnings.push('Fichier sans extension');
    } else if (!this.config.allowedExtensions.includes(extension)) {
      if (this.config.strictMode) {
        result.errors.push(`Extension .${extension} non supportée`);
      } else {
        result.warnings.push(`Extension .${extension} pourrait ne pas être supportée`);
      }
    }

    // Vérification MIME type
    if (file.type) {
      result.metadata!.actualMimeType = file.type;
      if (!this.config.allowedMimeTypes.includes(file.type.toLowerCase())) {
        result.warnings.push(`Type MIME ${file.type} non reconnu`);
      }
    }
  }

  private static detectFileType(file: File): FileType {
    const extension = this.getFileExtension(file.name);
    const mimeType = file.type?.toLowerCase() || '';

    // CSV/TSV
    if (extension === 'csv' || mimeType.includes('csv')) {
      return FileType.CSV;
    }
    if (extension === 'tsv' || mimeType.includes('tab-separated')) {
      return FileType.TSV;
    }
    if (extension === 'txt' && !mimeType.includes('json')) {
      return FileType.CSV; // Par défaut pour .txt
    }

    // GeoJSON
    if (extension === 'geojson' ||
        extension === 'json' ||
        mimeType.includes('geo+json') ||
        mimeType.includes('json')) {
      return FileType.GEOJSON;
    }

    // Shapefile
    if (['shp', 'shx', 'dbf', 'prj', 'cpg', 'sbn', 'sbx'].includes(extension)) {
      return FileType.SHAPEFILE;
    }

    // GeoPackage
    if (extension === 'gpkg' || mimeType.includes('geopackage')) {
      return FileType.GEOPACKAGE;
    }

    // KML/KMZ
    if (extension === 'kml' || mimeType.includes('kml')) {
      return FileType.KML;
    }
    if (extension === 'kmz' || mimeType.includes('kmz')) {
      return FileType.KMZ;
    }

    return FileType.UNKNOWN;
  }

  private static validateByType(file: File, result: DetailedValidationResult): void {
    switch (result.fileType) {
      case FileType.CSV:
      case FileType.TSV:
        if (file.size > 10 * 1024 * 1024) {
          result.warnings.push('Fichier CSV/TSV volumineux, le parsing pourrait être lent');
        }
        break;

      case FileType.SHAPEFILE:
        const ext = this.getFileExtension(file.name);
        if (ext === 'shp' && file.size < 100) {
          result.warnings.push('Fichier SHP suspicieusement petit');
        }
        if (ext === 'shp' || ext === 'dbf') {
          result.warnings.push(`Assurez-vous d'importer tous les fichiers du Shapefile (.shp, .shx, .dbf minimum)`);
        }
        break;

      case FileType.GEOPACKAGE:
        if (file.size < 1024) {
          result.errors.push('Fichier GeoPackage trop petit pour être valide');
        }
        break;

      case FileType.GEOJSON:
        if (file.size > 20 * 1024 * 1024) {
          result.warnings.push('GeoJSON volumineux, considérez un format plus efficace comme GeoPackage');
        }
        break;

      case FileType.UNKNOWN:
        result.errors.push('Type de fichier non reconnu');
        break;
    }
  }

  private static async validateCSVContent(file: File, buffer: ArrayBuffer, result: DetailedValidationResult): Promise<void> {
    const text = new TextDecoder('utf-8').decode(buffer);
    const lines = text.split(/\r?\n/).filter(line => line.trim());

    if (lines.length === 0) {
      result.errors.push('Fichier CSV vide');
      return;
    }

    // Détection du séparateur
    const separators = [',', ';', '\t', '|'];
    let detectedSeparator = ',';
    let maxCount = 0;

    for (const sep of separators) {
      const count = (lines[0].match(new RegExp(sep, 'g')) || []).length;
      if (count > maxCount) {
        maxCount = count;
        detectedSeparator = sep;
      }
    }

    if (maxCount === 0) {
      result.warnings.push('Aucun séparateur détecté, le fichier pourrait ne pas être un CSV valide');
    }

    // Vérification de la cohérence des colonnes
    const firstLineColumns = lines[0].split(detectedSeparator).length;
    let inconsistentLines = 0;

    for (let i = 1; i < Math.min(lines.length, 10); i++) {
      if (lines[i].split(detectedSeparator).length !== firstLineColumns) {
        inconsistentLines++;
      }
    }

    if (inconsistentLines > 0) {
      result.warnings.push('Nombre de colonnes incohérent dans les premières lignes');
    }

    // Détection d'encodage
    const hasBOM = buffer.byteLength >= 3 &&
                   new Uint8Array(buffer)[0] === 0xEF &&
                   new Uint8Array(buffer)[1] === 0xBB &&
                   new Uint8Array(buffer)[2] === 0xBF;

    if (hasBOM) {
      result.metadata!.encoding = 'UTF-8 with BOM';
    } else {
      result.metadata!.encoding = 'UTF-8';
    }
  }

  private static async validateGeoJSONContent(file: File, buffer: ArrayBuffer, result: DetailedValidationResult): Promise<void> {
    const text = new TextDecoder('utf-8').decode(buffer);

    try {
      // Vérification basique de la structure JSON
      const trimmed = text.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        result.errors.push('Le fichier ne commence pas par { ou [');
        return;
      }

      // Pour un GeoJSON complet, on devrait parser et vérifier la structure
      // mais pour les gros fichiers, on se limite aux premiers caractères
      if (file.size < 1024 * 1024) { // < 1MB, on peut parser
        const parsed = JSON.parse(text);

        if (!parsed.type) {
          result.warnings.push('Propriété "type" manquante, pourrait ne pas être un GeoJSON valide');
        } else if (!['Feature', 'FeatureCollection', 'Point', 'LineString', 'Polygon',
                    'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection']
                    .includes(parsed.type)) {
          result.errors.push(`Type GeoJSON invalide: ${parsed.type}`);
        }

        if (parsed.type === 'FeatureCollection' && !parsed.features) {
          result.errors.push('FeatureCollection sans propriété "features"');
        }
      }
    } catch (error) {
      if (file.size < 1024 * 1024) {
        result.errors.push('JSON invalide');
      } else {
        result.warnings.push('Impossible de valider complètement le JSON (fichier trop gros)');
      }
    }
  }

  private static async validateShapefileContent(file: File, buffer: ArrayBuffer, result: DetailedValidationResult): Promise<void> {
    const view = new DataView(buffer);
    const ext = this.getFileExtension(file.name);

    if (ext === 'shp' && buffer.byteLength >= 4) {
      const magic = view.getUint32(0, false);
      if (magic !== 0x0000270a) {
        result.errors.push('Signature de fichier SHP invalide');
      }
    }

    if (ext === 'dbf' && buffer.byteLength >= 1) {
      const version = view.getUint8(0);
      const validVersions = [0x03, 0x83, 0x8B, 0xCB, 0xF5, 0xFB];
      if (!validVersions.includes(version)) {
        result.warnings.push('Version DBF non standard');
      }
    }
  }

  private static async validateGeoPackageContent(file: File, buffer: ArrayBuffer, result: DetailedValidationResult): Promise<void> {
    const signature = new Uint8Array(buffer.slice(0, 16));
    const sqliteSignature = new TextDecoder('ascii').decode(signature);

    if (!sqliteSignature.startsWith('SQLite format 3')) {
      result.errors.push('Fichier GeoPackage invalide (pas un fichier SQLite)');
      return;
    }

    // Un GeoPackage valide doit avoir au moins quelques KB
    if (file.size < 10 * 1024) {
      result.warnings.push('Fichier GeoPackage suspicieusement petit');
    }
  }

  private static validateShapefileGroup(
    files: File[],
    results: Map<string, DetailedValidationResult>,
    globalErrors: string[]
  ): void {
    const shapefileComponents = new Map<string, Set<string>>();

    // Grouper les composants par nom de base
    for (const file of files) {
      const result = results.get(file.name);
      if (result?.fileType === FileType.SHAPEFILE) {
        const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
        const ext = this.getFileExtension(file.name);

        if (!shapefileComponents.has(baseName)) {
          shapefileComponents.set(baseName, new Set());
        }
        shapefileComponents.get(baseName)!.add(ext);
      }
    }

    // Vérifier que chaque shapefile a les composants minimum
    for (const [baseName, extensions] of shapefileComponents) {
      const requiredExtensions = ['shp', 'shx', 'dbf'];
      const missing = requiredExtensions.filter(ext => !extensions.has(ext));

      if (missing.length > 0) {
        globalErrors.push(
          `Shapefile "${baseName}" incomplet. Fichiers manquants: ${missing.map(e => `.${e}`).join(', ')}`
        );
      }
    }
  }

  private static requiresAsyncValidation(fileType: FileType): boolean {
    return [
      FileType.CSV,
      FileType.TSV,
      FileType.GEOJSON,
      FileType.SHAPEFILE,
      FileType.GEOPACKAGE
    ].includes(fileType);
  }

  private static async readFileHeader(file: File, bytes: number = 512): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const blob = file.slice(0, Math.min(bytes, file.size));

      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }

  private static getMagicNumber(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer.slice(0, 8));
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ')
      .toUpperCase();
  }

  private static getFileExtension(filename: string): string {
    return filename.toLowerCase().split('.').pop() || '';
  }

  /**
   * Validation d'URL pour import distant
   */
  static validateURL(url: string): DetailedValidationResult {
    const result: DetailedValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fileType: FileType.UNKNOWN,
      requiresAsyncValidation: false
    };

    try {
      const parsed = new URL(url);

      // Vérification protocole
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        result.errors.push('Seuls les protocoles HTTP et HTTPS sont autorisés');
      }

      // Vérification domaines interdits (exemple)
      const blockedDomains = ['localhost', '127.0.0.1', '0.0.0.0'];
      if (blockedDomains.includes(parsed.hostname)) {
        result.errors.push('Domaine non autorisé');
      }

      // Détection du type par l'extension dans l'URL
      const pathname = parsed.pathname;
      const extension = pathname.split('.').pop()?.toLowerCase();

      if (extension && this.config.allowedExtensions.includes(extension)) {
        result.fileType = this.detectFileType({ name: pathname, type: '' } as File);
      } else {
        result.warnings.push('Impossible de déterminer le type de fichier depuis l\'URL');
      }

      // Warning pour les URLs non HTTPS
      if (parsed.protocol === 'http:') {
        result.warnings.push('Utilisation de HTTP non sécurisé');
      }

    } catch (error) {
      result.errors.push('URL invalide');
    }

    result.isValid = result.errors.length === 0;
    return result;
  }
}

// Export des types de fichiers supportés pour l'UI
export const SUPPORTED_FILE_TYPES = {
  tabular: {
    extensions: ['.csv', '.tsv', '.txt'],
    mimeTypes: ['text/csv', 'text/tab-separated-values', 'text/plain'],
    description: 'Données tabulaires (CSV, TSV)'
  },
  geojson: {
    extensions: ['.geojson', '.json'],
    mimeTypes: ['application/geo+json', 'application/json'],
    description: 'GeoJSON'
  },
  shapefile: {
    extensions: ['.shp', '.shx', '.dbf', '.prj', '.cpg'],
    mimeTypes: ['application/x-shapefile', 'application/octet-stream'],
    description: 'Shapefile (tous les composants)'
  },
  geopackage: {
    extensions: ['.gpkg'],
    mimeTypes: ['application/geopackage+sqlite3'],
    description: 'GeoPackage'
  }
};