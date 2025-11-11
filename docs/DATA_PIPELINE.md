# Data Pipeline

> **Architecture moderne de traitement des données avec DuckDB**

## Vue d'Ensemble

La nouvelle architecture data pipeline suit les principes **SOLID**, **KISS** et **DRY** avec une séparation claire en trois couches : **Domain**, **Application** et **Infrastructure**.

## Architecture

### Structure des Couches

```
src/lib/features/data/
├── domain/              # Logique métier pure (interfaces + entités + value objects)
│   ├── interfaces/      # Contrats abstraits (IParser, IValidator, ITypeInferrer)
│   ├── entities/        # Objets métier (RawDataset, DatasetResult)
│   └── value-objects/   # Valeurs immuables (ColumnType, ValidationResult)
├── application/         # Use cases et services (orchestration)
│   └── services/        # DataPipelineService (Facade)
└── infrastructure/      # Implémentations concrètes
    ├── parsers/         # CSVParser, GeoJSONParser, ShapefileParser
    ├── validators/      # SizeValidator, SchemaValidator, QualityValidator
    └── type-inference/  # HeuristicTypeInferrer
```

## État de Migration

### Composants Migrés ✅

- **datasetsStore** - Utilise `dataPipeline.processUploadedFile()`
- **FileProcessorService (CsvProcessor)** - Utilise `CSVParser` directement (fix worker error)

### Avantages de la Migration

1. **Performance** - Plus de triple processing, pipeline unifié en un seul passage
2. **Fiabilité** - Suppression des erreurs Web Worker (`Cannot read properties of undefined`)
3. **Maintenabilité** - Architecture SOLID facilite l'extension et les tests
4. **Type Safety** - 100% TypeScript typé, zéro `any`

### Note sur Web Workers

La version précédente utilisait un Web Worker pour le parsing CSV (`csv-parser.worker.ts`). Cette approche causait des erreurs de message passing dans certains navigateurs. La nouvelle architecture utilise PapaParse directement dans le thread principal, ce qui :

- Élimine les erreurs de worker message structure
- Réduit la complexité du code
- Maintient de bonnes performances (PapaParse est très optimisé)
- Pour les très gros fichiers (>10MB), l'inférence de types échantillonne seulement 100 lignes

## Formats Supportés

| Format        | Extensions             | Parseur         | Caractéristiques                                               |
| ------------- | ---------------------- | --------------- | -------------------------------------------------------------- |
| **CSV/TSV**   | `.csv`, `.tsv`, `.txt` | CSVParser       | Données tabulaires, inférence automatique des types, PapaParse |
| **GeoJSON**   | `.geojson`, `.json`    | GeoJSONParser   | Données spatiales, support géométrie, calcul bounds            |
| **Shapefile** | `.shp` + compléments   | ShapefileParser | Multi-fichiers géométrie + attributs                           |

## Flux de Traitement

### Pipeline Unifiée (Single Pass)

```
1. Upload Fichier
        ↓
2. ParserRegistry → Trouve le bon parser
        ↓
3. Parser.parse() → Crée RawDataset
        ↓
4. ValidationChain → Valide données (taille, schéma, qualité)
        ↓
5. HeuristicTypeInferrer → Infère types colonnes
        ↓
6. DuckDB → Crée table + analyse statistiques
        ↓
7. DatasetResult → Dataset enrichi avec stats
```

**Avantage** : Traitement **une seule fois** au lieu de 3 fois (ancienne architecture)

## API Publique

### Utilisation Simple

```typescript
import { dataPipeline } from '$lib/features/data';

// 1. Initialiser (une fois au démarrage)
await dataPipeline.initialize();

// 2. Traiter un fichier
const result = await dataPipeline.processFile(file);

// 3. Utiliser le résultat
console.log(result.tableName); // Nom de la table DuckDB
console.log(result.columns); // Colonnes enrichies avec statistiques
console.log(result.rowCount); // Nombre de lignes
console.log(result.geometry); // Info géométrie (si spatial)
```

### Format du Résultat

```typescript
interface ProcessedDataset {
  id: string;                       // ID unique
  name: string;                     // Nom du fichier
  sourceFileId: string;             // ID fichier source
  format: 'csv' | 'geojson' | 'shapefile';

  // Données
  data: Record<string, unknown>[];  // Lignes
  rowCount: number;                 // Nombre total

  // Colonnes enrichies
  columns: ColumnInfo[];            // Avec types + stats

  // Analyse
  analysis: {
    columns: ColumnInfo[];
    hasGeoData: boolean;
    geoColumns: GeoColumnInfo[];
    rowCount: number;
    warnings: string[];
  };

  // Géométrie (si applicable)
  geometry?: 'Point' | 'Polygon' | ...;
  bounds?: { minLat, maxLat, minLon, maxLon };

  // DuckDB
  duckdbTableName: string;          // Table pour requêtes SQL

  // Métadonnées
  metadata: {
    processedAt: Date;
    transformations: string[];
  };
}
```

## Design Patterns Appliqués

### 1. Facade Pattern

**DataPipelineService** simplifie l'accès à tout le système :

```typescript
export class DataPipelineService {
  async processFile(file: File): Promise<ProcessedDataset> {
    // Orchestre : parsing → validation → inference → DuckDB
  }
}
```

### 2. Strategy Pattern

Parsers interchangeables via `IParser` :

```typescript
interface IParser {
  canParse(file: File): boolean;
  parse(file: File): Promise<RawDataset>;
}
```

### 3. Chain of Responsibility

Validation en chaîne :

```typescript
const chain = new ValidationChain([
  new SizeValidator(), // Vérifie tailles
  new SchemaValidator(), // Vérifie schéma
  new QualityValidator() // Vérifie qualité
]);
```

### 4. Registry Pattern

Sélection automatique du parser :

```typescript
const parser = parserRegistry.findParser(file);
const dataset = await parser.parse(file);
```

## Inférence de Types

### Priorité de Détection

```
1. Boolean    → true/false, 0/1, yes/no
2. Date       → ISO 8601, formats courants
3. Number     → Entiers, décimaux
4. Geometry   → WKT, coordonnées
5. Text       → Par défaut
```

### Seuil de Confiance

- **80%** des valeurs doivent matcher pour inférer un type
- Échantillonnage des **100 premières lignes**

## Validation

### Validateurs

1. **SizeValidator**
   - Warning : > 5,000 lignes ou > 50 colonnes
   - Error : > 10,000 lignes ou > 100 colonnes

2. **SchemaValidator**
   - Noms de colonnes uniques
   - Pas de colonnes vides
   - Longueur de lignes cohérente

3. **QualityValidator**
   - Warning : > 50% valeurs nulles
   - Warning : Cardinalité très faible (< 1%)

## Intégration DuckDB

### Avantages

- **Performances** : Analyse SQL optimisée
- **Statistiques** : min, max, mean, median, stddev, count, nulls, uniques
- **Requêtes** : Calculs de breaks, agrégations, jointures
- **Mémoire** : Gestion efficace des gros datasets

### Utilisation

```typescript
// Table automatiquement créée par dataPipeline
const result = await dataPipeline.processFile(file);

// Utiliser DuckDB directement si besoin
import { Duck } from '$lib/features/commons/services/duckdb/duckdb';

const rows = await Duck.query(`
  SELECT * FROM ${result.duckdbTableName}
  WHERE column > 100
  ORDER BY column DESC
`);
```

## Extension

### Ajouter un Nouveau Parser

```typescript
// 1. Implémenter l'interface
export class ExcelParser implements IParser {
  readonly supportedExtensions = ['.xlsx', '.xls'];
  readonly mimeTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

  canParse(file: File): boolean {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    return this.supportedExtensions.includes(ext);
  }

  async parse(file: File): Promise<RawDataset> {
    // Logique de parsing Excel
    return {
      headers: [...],
      rows: [...],
      columns: [...]
    };
  }
}

// 2. Enregistrer dans le registry
const registry = new ParserRegistry();
registry.register(new ExcelParser());
```

### Ajouter un Validateur

```typescript
// 1. Implémenter l'interface
export class CustomValidator implements IValidator {
  validate(data: RawDataset): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Logique de validation

    return { isValid: errors.length === 0, errors, warnings };
  }
}

// 2. Ajouter à la chaîne
const chain = new ValidationChain();
chain.register(new CustomValidator());
```

## Performance

### Optimisations Implémentées

- ✅ **Single Pass** : Traitement unique au lieu de 3 fois
- ✅ **Type Inference Optimisée** : Échantillonnage limité
- ✅ **DuckDB Direct** : Pas de stringify JSON
- ✅ **Validation Lazy** : Stop on first error optionnel

### Métriques Attendues

| Métrique             | Avant  | Après     | Amélioration        |
| -------------------- | ------ | --------- | ------------------- |
| Fichier 1000 lignes  | ~25s   | ~1.5s     | **16x plus rapide** |
| Mémoire utilisée     | Élevée | Optimisée | **~50% moins**      |
| Passes de traitement | 3      | 1         | **3x moins**        |

## Exports Publics

```typescript
// Types principaux
export type { ProcessedDataset } from './types/ProcessedDataset';
export type { ColumnInfo, AnalysisResult } from './types/AnalysisResult';

// Service principal
export {
  dataPipeline,
  DataPipelineService
} from './application/services/data-pipeline.service';

// Pour extensions
export {
  CSVParser,
  GeoJSONParser,
  ShapefileParser
} from './infrastructure/parsers/';
export { ParserRegistry } from './infrastructure/parsers/parser.registry';
export { ValidationChain } from './infrastructure/validators/validation.chain';
export { HeuristicTypeInferrer } from './infrastructure/type-inference/heuristic-inferrer';
```

## Principes SOLID Respectés

### Single Responsibility ✅

Chaque classe a **une seule responsabilité** :

- CSVParser : Parse CSV uniquement
- SizeValidator : Valide tailles uniquement

### Open/Closed ✅

**Extensible** sans modifier le code existant :

- Nouveau parser → Implémenter `IParser` + register
- Nouveau validateur → Implémenter `IValidator` + add to chain

### Liskov Substitution ✅

Toutes les implémentations d'une interface sont **interchangeables**

### Interface Segregation ✅

Interfaces **petites et focalisées** (2-3 méthodes max)

### Dependency Inversion ✅

Dépend d'**abstractions** (interfaces), pas de concrétions

## Compatibilité

### Backwards Compatibility

L'ancienne API est toujours supportée :

```typescript
// Ancienne méthode (toujours fonctionnelle)
const result = await dataPipeline.processUploadedFile(uploadedFile);

// Nouvelle méthode (recommandée)
const result = await dataPipeline.processFile(file);
```

### Migration Progressive

Les composants existants continuent de fonctionner sans modification. La migration peut se faire progressivement.

## État Actuel

### ✅ Phases Complétées

- **Phase 1-5** : Architecture implémentée
- **Phase 6** : Migration datasetsStore
- **Phase 6.5** : Nettoyage code mort (~1,578 lignes supprimées)

### ⏭️ Phases À Venir

- **Phase 7** : Optimisations (streaming, workers)
- **Phase 8** : Documentation développeur complète

## Voir Aussi

- [Architecture Générale](./ARCHITECTURE.md)
- [Guide Développeur](./DEVELOPER_GUIDE.md)
- [Référence API](./REFERENCE.md)
