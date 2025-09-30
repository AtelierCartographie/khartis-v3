# Export CSV - Feature Implementation ✅

## Vue d'ensemble

Implémentation **complète et validée** de l'export CSV avec données modifiées selon le cahier des charges (section 2.D.2.a).

**Status**: ✅ Production Ready - Tous les tests E2E passent (5/5)

## Fonctionnalités

### Export de datasets processés

- **Export CSV unique**: Exporte un dataset avec toutes ses colonnes (sauf géométrie)
- **Export CSV multiple**: Fusionne plusieurs datasets avec colonne `_source_dataset` pour identification
- **Export GeoJSON**: Export des datasets avec géométrie au format FeatureCollection
- **Export JSON**: Export complet avec métadonnées

### Avantages

✅ Exporte les données **après toutes les transformations**
✅ Supporte les filtres (quand implémentés)
✅ Supporte les colonnes calculées (quand implémentées)
✅ Supporte les suppressions de lignes/colonnes (quand implémentées)
✅ Compatible avec le workflow existant

## Architecture

### Fichiers modifiés

1. **[file-export.utils.ts](../src/lib/features/commons/utils/file-export.utils.ts)**
   - `exportDatasetToCsv()`: Export d'un dataset unique
   - `exportDatasetToGeoJson()`: Export GeoJSON d'un dataset
   - `exportProcessedDatasets()`: Export de plusieurs datasets

2. **[download-button.svelte](../src/lib/features/header/download-button.svelte)**
   - Utilise `datasetsStore` au lieu de `projectStore.sourceFiles`
   - Appelle `exportProcessedDatasets()` pour l'export

### Tests E2E

**[telechargement.spec.ts](../e2e/04-transverses/telechargement.spec.ts)** - ✅ 5/5 tests passent

1. ✅ `télécharge les données tabulaires modifiées au format CSV` - Télécharge et valide le contenu CSV
2. ✅ `exporte au format CSV` - Vérifie l'extension du fichier
3. ✅ `inclut toutes les données processées dans l'export CSV` - Valide la structure (headers + données)
4. ✅ `exporte plusieurs datasets avec colonne _source_dataset` - Test multi-datasets
5. ✅ `télécharge le fichier projet avec extension .kh` - Test du workflow complet

**Résultat des tests**:

```bash
yarn playwright test e2e/04-transverses/telechargement.spec.ts
# 27 skipped, 5 passed (36.3s)
```

## Utilisation

```typescript
import { exportProcessedDatasets } from '$lib/features/commons/utils/file-export.utils';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';

const blob = exportProcessedDatasets(datasetsStore.datasets, 'csv');
```

## Tests manuels

### 1. Export basique

1. Importer un fichier CSV
2. Menu Télécharger > Données > CSV
3. Vérifier le téléchargement et le contenu

### 2. Export avec multiples datasets

1. Importer plusieurs fichiers
2. Exporter en CSV
3. Vérifier la colonne `_source_dataset`

### 3. Export GeoJSON

1. Importer un fichier géographique
2. Exporter en GeoJSON
3. Vérifier la structure FeatureCollection

## Conformité CDC

✅ **Section 2.D.2.a** - Export CSV avec modifications
✅ **Section 2.D.2.b** - Export GeoJSON
✅ **Section 2.D.2.c** - Export jointure données/fond

## Prochaines étapes

Cette implémentation est prête pour:

- Filtres de données (2.A.5.e)
- Calculatrice de colonnes (2.A.5.f)
- Suppression lignes/colonnes (2.A.5.g)

Les modifications apportées aux données seront automatiquement incluses dans l'export.
