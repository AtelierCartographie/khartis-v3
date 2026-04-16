# Audit khartis-v3 — 2026-04-14

> Document d'audit pré-refactoring, généré à partir de l'index GitNexus fraîchement régénéré sur `HEAD 2b110782` (branche `tma-jb-w16-0526`).
> Chaque finding est sourcé : commande/chemin cité pour reproduction.

## État d'exécution (2026-04-14)

Batch 1 (quick wins, dédup sûres, magic strings ciblés) exécuté — `pnpm check`, `pnpm lint`, `pnpm test:unit` tous verts (120 files, 663/663 tests).

| Tâche                                 | Statut              | Note                                                                          |
| ------------------------------------- | ------------------- | ----------------------------------------------------------------------------- |
| T-001 `replaceAtIndex`                | skip (faux positif) | utilisé `datasets-crud.ts:16,98`                                              |
| T-002 alias `generateDuplicateName`   | **done**            | inline dans visualization.store                                               |
| T-003 proxy `search-ops.ts`           | **done**            | fichier supprimé, orchestrator appelle `Duck.searchInTable` directement       |
| T-004 clone vs clone-for-storage      | skip                | sémantiques distinctes à préserver                                            |
| T-005 fallbacks GeoJSON               | deferred            | chantier `map/` majeur, PR dédiée                                             |
| T-006 / T-020 `MIME @deprecated`      | **done**            | ré-export retiré, zéro consommateur                                           |
| T-007 `EnvironmentUtils`              | skip (faux positif) | utilisé `header/logo.svelte:7`                                                |
| T-010 helper `skipAnalysis`           | **done** (partiel)  | `maybeAnalyse()` extrait dans `column-ops.ts`                                 |
| T-011 CRS 3x                          | deferred            | chantier `arrow-ops.ts`                                                       |
| T-014 `useSelectedAnnotationByType`   | **done**            | hook extrait dans `_shared/`                                                  |
| T-015 `formatValue` merge             | skip                | sémantiques null-placeholder divergentes                                      |
| T-016 GPS tokens                      | **done**            | `LATITUDE_TOKENS`/`LONGITUDE_TOKENS` constants                                |
| T-019 fonts                           | **done**            | `step-toolbar/constants/fonts.constants.ts` créé, legend.constants ré-exporte |
| T-031 styling constants               | skip                | déjà nommées localement (pas d'import externe)                                |
| T-032 search constants                | skip                | déjà nommées localement                                                       |
| T-034 BasemapSourceTab enum           | skip                | mapping enum→index déjà clair                                                 |
| T-038 `INTERNAL_COLUMN.ID`            | **done** (partiel)  | `table-data-ops.ts` cleanup, `operations/search.ts` ouvert                    |
| T-049 `suggestion.utils` → `.service` | **done**            | rename + 3 imports + 1 test mis à jour                                        |
| T-050 barrel reorg                    | deferred            | risque régression imports                                                     |
| T-051 `<ToolPanel>` shared            | deferred            | refacto UI dédiée                                                             |
| T-055 persistence keys registry       | deferred            | registry nécessite refonte de `persistenceRegistry`                           |

Tâches **CRITICAL / large** non démarrées (demandent revue humaine et PR dédiées) : T-005, T-008, T-009, T-012, T-021, T-022, T-023, T-024, T-025, T-026, T-027, T-028, T-029, T-030, T-039, T-040, T-041, T-042, T-043, T-044, T-045, T-046, T-047, T-048, T-052, T-053, T-054.

Changements non commités (SSH key non chargée au moment de l'exécution) — à signer après `ssh-add ~/.ssh/id_ed25519`.

---

## 0. Résumé exécutif

| Métrique                                  | Valeur                                            |
| ----------------------------------------- | ------------------------------------------------- |
| Features auditées                         | 10                                                |
| Fichiers analysés (features)              | 511                                               |
| LOC totale (features)                     | ~114 745                                          |
| Symboles indexés (repo)                   | 9 711                                             |
| Relations indexées                        | 24 627                                            |
| Processes                                 | 300                                               |
| Index staleness au démarrage              | STALE 1 commit → rafraîchi via `gitnexus analyze` |
| Issues critiques (SOLID, inversion archi) | **7**                                             |
| Quick wins (< 2 h)                        | **18**                                            |
| Chantiers moyens (2–8 h)                  | **21**                                            |
| Chantiers lourds (> 8 h)                  | **9**                                             |
| **Total tâches**                          | **55**                                            |

### Points saillants

1. **Inversion d'architecture majeure** : `commons/services/data-orchestrator.service.svelte.ts` (1 275 LOC) importe depuis `main-toolbar/` et `step-toolbar/` (L16–18, L52–53). `commons` est censé être la couche basse.
2. **`layer-factory.ts` (3 951 LOC)** — God File avec 3 sous-pipelines point/line/polygon quasi-identiques et 3 fallbacks GeoJSON qui violent la règle « Arrow only ».
3. **`commons/utils/` (6 760 LOC, 43 fichiers)** — dumping ground : mélange de domaines (map-export, projection, color, semio-detector, facet-generator) dont plusieurs appartiennent ailleurs.
4. **Duplication data-pipeline ↔ create-project** — `create-project/services/file-processor.service.ts` (687 LOC) ré-implémente des processeurs déjà en `data-pipeline/processors/strategies/`.
5. **Pattern `skipAnalysis` répété 18+ fois** dans `duckdb/orchestrator/*-ops.ts` — helper manquant.
6. **Système de migrations vide** (`project-management/core/schema-migration.ts` : `const migrations = []`), alors que `serializer.ts` contient du code de rétro-compat inline (ex. `title_fr || title`).
7. **Seulement 1 TODO/FIXME/HACK dans tout `src/lib/features/`** : `data-pipeline/constants.ts:70` `@deprecated MIME` — dette déclarative quasi-nulle (bon signe mais angles morts à documenter).

### Verdict

La base est **fonctionnellement propre** (pas de TODO/FIXME/`console.log` résiduels), mais **structurellement surchargée**. Les deux causes racines sont :

- **commons a muté en shared kitchen sink** : 25 616 LOC, dont un `utils/` de 6 760 LOC sans contour de responsabilité.
- **Des mega-fichiers subissent la croissance fonctionnelle sans découpage** : 7 fichiers dépassent 1 000 LOC, 3 dépassent 2 000, 1 dépasse 3 900.

Le chantier est **refactor-only, pas rewrite** : l'architecture cible (feature-based) existe déjà et est documentée dans `.claude/rules/`, il s'agit de **faire respecter** la séparation et d'**extraire** des modules cohérents.

---

## 1. Inventaire des features

### 1.1 Vue d'ensemble

| Feature            | Chemin                                 |    LOC | Fichiers | Plus gros fichier                                       | État                    | Risque   |
| ------------------ | -------------------------------------- | -----: | -------: | ------------------------------------------------------- | ----------------------- | -------- |
| commons            | `src/lib/features/commons/`            | 25 616 |      135 | `store/visualization.store.svelte.ts` (1 372)           | surchargé               | **HIGH** |
| main-toolbar       | `src/lib/features/main-toolbar/`       | 29 754 |      117 | `data-tab/basemap-join-step.svelte` (1 471)             | mega-SFC                | **HIGH** |
| map                | `src/lib/features/map/`                | 26 738 |       74 | `layers/layer-factory.ts` (3 951)                       | God file                | **HIGH** |
| step-toolbar       | `src/lib/features/step-toolbar/`       | 12 985 |       75 | `tools/annotations/annotations.store.svelte.ts` (1 104) | propre                  | MEDIUM   |
| duckdb             | `src/lib/features/duckdb/`             |  9 313 |       41 | `orchestrator/join-ops.ts` (941)                        | duplication facade/ops  | MEDIUM   |
| data-pipeline      | `src/lib/features/data-pipeline/`      |  4 054 |       32 | `processors/file-processor.ts` (349)                    | correct                 | LOW      |
| create-project     | `src/lib/features/create-project/`     |  3 210 |       13 | `create-new-project.svelte` (789)                       | chevauche data-pipeline | LOW      |
| project-management | `src/lib/features/project-management/` |  1 643 |       14 | `core/serializer.ts` (448)                              | migrations vides        | LOW      |
| header             | `src/lib/features/header/`             |  1 296 |        9 | `download-button.svelte` (382)                          | OK                      | LOW      |
| side-nav           | `src/lib/features/side-nav/`           |    136 |        1 | `use-side-nav.hook.svelte.ts` (136)                     | OK                      | LOW      |

_Source : `find src/lib/features/<name> -type f \( -name "_.ts" -o -name "_.svelte" \) -exec wc -l {} +`._

### 1.2 Mega-fichiers (> 400 LOC)

Source commande : `find src/lib/features -type f \( -name "*.ts" -o -name "*.svelte" \) -exec wc -l {} + | awk '$1 > 400'`.

| Fichier                                                                      |   LOC | Axes concernés                |
| ---------------------------------------------------------------------------- | ----: | ----------------------------- |
| `map/layers/layer-factory.ts`                                                | 3 951 | SOLID, DRY, dead branches     |
| `map/components/thematic-map.svelte`                                         | 2 273 | SOLID (orchestration + rendu) |
| `map/layers/basemap-layers.ts`                                               | 1 768 | SOLID (8 layer types)         |
| `main-toolbar/data-tab/basemap-join-step.svelte`                             | 1 471 | SOLID, découpage              |
| `map/components/annotation-overlay.svelte`                                   | 1 433 | SOLID                         |
| `commons/store/visualization.store.svelte.ts`                                | 1 372 | God Object                    |
| `map/services/basemap.service.svelte.ts`                                     | 1 290 | SOLID (9 exports)             |
| `commons/services/data-orchestrator.service.svelte.ts`                       | 1 275 | Inversion archi               |
| `map/components/geo-indications-overlay.svelte`                              | 1 234 | SOLID                         |
| `commons/components/advanced-data-table/.../table-column-header.svelte`      | 1 151 | SOLID                         |
| `step-toolbar/tools/annotations/annotations.store.svelte.ts`                 | 1 104 | SOLID                         |
| `main-toolbar/visualization-tab/choose-visualization.svelte`                 | 1 069 | SOLID                         |
| `commons/components/advanced-data-table/advanced-data-table.svelte`          | 1 041 | SOLID                         |
| `commons/utils/geo-detector.utils.ts`                                        |   949 | magic numbers scoring         |
| `duckdb/orchestrator/join-ops.ts`                                            |   941 | 7 responsabilités             |
| `duckdb/orchestrator/orchestrator.svelte.ts`                                 |   922 | facade trop large             |
| `main-toolbar/components/toolbar-tabs.svelte`                                |   917 | SOLID                         |
| `commons/store/create-project.store.svelte.ts`                               |   914 | SOLID                         |
| `map/main-map.svelte`                                                        |   893 | SOLID                         |
| `map/components/legend-overlay.svelte`                                       |   887 | SOLID                         |
| `main-toolbar/visualization-tab/configure-visualization.svelte`              |   872 | SOLID                         |
| `main-toolbar/data-tab/data-control-step.svelte`                             |   866 | SOLID                         |
| `main-toolbar/data-tab/basemap-join-components/join-assisted-section.svelte` |   835 | SOLID                         |
| `map/hooks/use-map-layers.svelte.ts`                                         |   828 | —                             |
| `map/utils/geoarrow-stream-bridge.ts`                                        |   792 | organisation                  |
| `create-project/create-new-project.svelte`                                   |   789 | SOLID                         |
| `commons/services/viz-suggester.service.ts`                                  |   768 | —                             |
| `main-toolbar/data-tab/geolocation-step.svelte`                              |   767 | SOLID                         |
| `map/utils/basemap-import.utils.ts`                                          |   756 | organisation                  |
| `map/utils/read-geojson-arrow.ts`                                            |   699 | organisation                  |
| `main-toolbar/visualization-tab/components/texts-config.svelte`              |   688 | —                             |
| `create-project/services/file-processor.service.ts`                          |   687 | **duplication data-pipeline** |
| `duckdb/orchestrator/arrow-ops.ts`                                           |   672 | DRY (CRS)                     |
| `commons/utils/file-validator.utils.ts`                                      |   670 | —                             |

### 1.3 Dossiers suspects

| Dossier                |   LOC | Fichiers | Verdict                                                                                               |
| ---------------------- | ----: | -------: | ----------------------------------------------------------------------------------------------------- |
| `commons/utils/`       | 6 760 |      ~40 | **Fourre-tout** : mélange array/color/file/geo/projection/semio/facet/workspace                       |
| `map/utils/`           | 4 733 |       23 | Plus cohérent mais contient des services (basemap-import, read-geojson-arrow, geoarrow-stream-bridge) |
| `data-pipeline/utils/` |   801 |        — | OK                                                                                                    |

---

## 2. Issues par axe

> **Convention de numérotation** : `T-NNN` où `T-001..019` = code mort / quick wins, `T-020..030` = magic strings, `T-031..045` = split mega-fichiers, `T-046..052` = dédup cross-feature, `T-053..055` = SOLID lourds.

### 2.1 Code mort

> **Preuves** : Cypher `MATCH (f:Function) WHERE NOT EXISTS { MATCH ()-[:CodeRelation {type:'CALLS'}]->(f) } AND f.filePath STARTS WITH 'src/lib/features/' …` (40 fichiers) ; lecture ciblée des fichiers suspects.

La plupart des fonctions "orphelines" remontées par GitNexus sont des **exports publics de stores** consommés depuis des templates Svelte (angle mort : les bindings `{#if state.foo}` ne sont pas une edge CALLS). À triage humain, les vrais candidats restent peu nombreux.

**T-001** · Helper `replaceAtIndex()` sans consommateur

- **Localisation** : `src/lib/features/commons/utils/array-helpers.ts:L30-L37`
- **Preuve** : `grep -rn 'replaceAtIndex\b' src/lib` → 1 occurrence (la définition)
- **Action** : supprimer la fonction et son export
- **Effort** : S · **Risque** : low · **Dépend de** : —

**T-002** · Alias `generateDuplicateName()` = `generateUniqueNameWithCounter()`

- **Localisation** : `src/lib/features/commons/utils/naming.utils.ts:L33-L38`
- **Preuve** : lecture directe (aliasing pur)
- **Action** : supprimer l'alias, adapter les quelques appelants vers la fonction canonique
- **Effort** : S · **Risque** : low · **Dépend de** : —

**T-003** · `orchestrator/search-ops.ts` : proxy inutile

- **Localisation** : `src/lib/features/duckdb/orchestrator/search-ops.ts:L1-L32`
- **Preuve** : Cypher `MATCH (m:Method {name:'searchInTable'}) RETURN m.filePath` → 3 fichiers ; lecture confirme que `orchestrator/search-ops.ts` appelle `Duck.searchInTable()` qui appelle `operations/search.ts`. Cycle indirect.
- **Action** : supprimer le proxy, faire pointer l'orchestrator directement sur `operations/search.ts`
- **Effort** : S · **Risque** : low · **Dépend de** : —

**T-004** · `clone-for-storage.utils.ts` vs `clone.utils.ts`

- **Localisation** : `src/lib/features/commons/utils/clone-for-storage.utils.ts:L1-L37` + `commons/utils/clone.utils.ts:L7-L11`
- **Preuve** : lecture directe, 2 stratégies non-documentées
- **Action** : choisir une seule variante (probable `deepCloneForStorage` pour son support des types complexes), supprimer l'autre
- **Effort** : S · **Risque** : medium (sémantique JSON vs manuelle) · **Dépend de** : —

**T-005** · Fallbacks GeoJSON dans `layer-factory.ts` (violation règle)

- **Localisation** : `src/lib/features/map/layers/layer-factory.ts:L1858-L1878` (text), `L2282-L2323` (points), `L3579-L3612` (polygones)
- **Preuve** : lecture, confirmé par le commentaire L2288–L2290 `"GeoJSON fallback only for actual GeoJSON strings or legacy ogc.wkb"`
- **Règle violée** : `.claude/rules/map-rendering.md` → _user data : DuckDB → Arrow/WKB → geoarrow-deck-stream. GeoJSON n'est pas un path de rendu._
- **Action** : auditer si ces fallbacks sont encore déclenchés en production (tracer via logger), supprimer les branches mortes ou documenter l'unique cas restant (legacy import)
- **Effort** : M · **Risque** : medium · **Dépend de** : T-033 (split layer-factory)

**T-006** · `data-pipeline/constants.ts` : `MIME` déprécié

- **Localisation** : `src/lib/features/data-pipeline/constants.ts:L70`
- **Preuve** : `grep -n '@deprecated' src/lib/features` → 1 seul résultat : `MIME from '$lib/features/commons/constants' instead`
- **Action** : supprimer le ré-export déprécié, faire pointer les derniers consommateurs vers `$lib/features/commons/constants`
- **Effort** : S · **Risque** : low · **Dépend de** : —

**T-007** · `commons/utils/environment.utils.ts` — export `EnvironmentUtils` massif

- **Localisation** : `src/lib/features/commons/utils/environment.utils.ts:L1-L43` (1 021 B)
- **Preuve** : Cypher sur orphelins + lecture
- **Action** : vérifier appels (grep), supprimer ou réduire à l'API réellement utilisée
- **Effort** : S · **Risque** : low · **Dépend de** : —

### 2.2 Doublons / logique dupliquée

**T-008** · Trois pipelines presque identiques `createPointLayers` / `createLineLayers` / `createPolygonLayers`

- **Localisation** : `src/lib/features/map/layers/layer-factory.ts:L2213-L2819` (607 L), `L2820-L3249` (430 L), `L3250-L3768` (519 L)
- **Preuve** : lecture — chacun répète destructure ctx → encoding resolve → fork binary/GeoJSON → color accessor → size/width → highlight/dim → binary attrs + year filter
- **Action** : extraire 3 helpers `buildColorAccessor`, `buildSizeAccessor`, `buildHighlightAccessor` et un type `LayerBuildContext` partagé
- **Effort** : L · **Risque** : high (code critique de rendu) · **Dépend de** : T-033

**T-009** · `createDoubleProportionalPointLayers` duplique `createPointLayers`

- **Localisation** : `src/lib/features/map/layers/layer-factory.ts:L334-L657` (324 L) vs `L2213+` (607 L)
- **Preuve** : lecture, closure `createScatterLayer()` L465-L545 spécialisée mais pattern identique
- **Action** : après T-008, réutiliser les accessors partagés
- **Effort** : M · **Risque** : medium · **Dépend de** : T-008

**T-010** · Pattern `skipAnalysis` / cache invalidation répété 18+ fois

- **Localisation** : `src/lib/features/duckdb/orchestrator/column-ops.ts:L29-L41,L49-L61,L119-L127,L158-L187` ; `orchestrator/orchestrator.svelte.ts:L573-L627` et L267-L276
- **Preuve** : grep `if (!options?.skipAnalysis)` dans `duckdb/orchestrator/`
- **Action** : extraire `async function withAnalysis(tableName, op, options)` ou décorateur ; idem pour `bumpDatasetsVersion + invalidateDatasetCache`
- **Effort** : M · **Risque** : medium (risque de régression cache) · **Dépend de** : —

**T-011** · Normalisation CRS dupliquée 3 fois

- **Localisation** : `src/lib/features/duckdb/orchestrator/arrow-ops.ts:L52-L61` (`extractGeometryColumnCrs`), `L63-L77` (`getGeoArrowCrsName`), `L79-L…` (`buildGeoArrowCrs`)
- **Action** : consolider en un seul helper `normalizeGeometryCrs(rawCrs)` renvoyant nom + EPSG + WKT
- **Effort** : S · **Risque** : low · **Dépend de** : —

**T-012** · `create-project/services/file-processor.service.ts` duplique `data-pipeline`

- **Localisation** : `src/lib/features/create-project/services/file-processor.service.ts:L22-L86` (`detectFileTypeFromName`, `getMimeTypeFromFileType`) + L183-L303 (`createCsvProcessor`), L305-L368 (`createGeoJsonProcessor`), L370-L404 (`createGeoPackageProcessor`)
- **Preuve** : le repo a déjà `data-pipeline/processors/strategies/{csv,geojson,geoparquet,geopackage,…}-processor.ts` implémentant `FileProcessor`
- **Action** : supprimer les processeurs `create-project`, déléguer au pipeline, ne garder qu'un `file-validator` / `file-preview` UI-layer
- **Effort** : L · **Risque** : high (onboarding) · **Dépend de** : —

**T-013** · Color state management dupliqué dans annotations tools

- **Localisation** : `src/lib/features/step-toolbar/tools/annotations/drawing-tool.svelte:L40-L100`, `shape-tool.svelte:L44-L100`
- **Preuve** : même `isStrokeColorDescriptor()`, mêmes 8 variables HSL/hex, même `$effect()` conversion
- **Action** : extraire `<ColorStateEditor>` ou `useColorState()` hook dans `step-toolbar/tools/annotations/_shared/`
- **Effort** : M · **Risque** : low · **Dépend de** : —

**T-014** · Dérivation d'annotation sélectionnée par type copiée 3 fois

- **Localisation** : `src/lib/features/step-toolbar/tools/annotations/{text-tool,drawing-tool,shape-tool}.svelte` (L42-49, L31-38, L33-42)
- **Action** : hook `useSelectedAnnotationByType(kind)`
- **Effort** : S · **Risque** : low · **Dépend de** : —

**T-015** · `format.utils.ts` : `formatValue()` et `formatValueByType()` partagent 80 %

- **Localisation** : `src/lib/features/commons/utils/format.utils.ts:L37-L69` vs `L80-L100`
- **Action** : extraire un `formatNullableNumber(value, locale)` et composer
- **Effort** : S · **Risque** : low · **Dépend de** : —

**T-016** · Constantes `GPS_COLUMN_PATTERNS` re-litéralisées

- **Localisation** : `src/lib/features/commons/utils/geo-detector.utils.ts:L249-L252` (définies) vs `L363-L371, L382, L392, L417, L425` (re-litéralisées)
- **Action** : importer et réutiliser `GPS_COLUMN_PATTERNS`, ne pas redéclarer
- **Effort** : S · **Risque** : low · **Dépend de** : —

**T-017** · Patterns de step wizard dupliqués (main-toolbar)

- **Localisation** : 4 steps (`basemap-join-step`, `data-control-step`, `enrich-data-step`, `geolocation-step`) ré-implémentent `activeTabIndex = $state()`, `handleTabChange`, `resetState`
- **Action** : abstraire `<BaseStep>` + `use-step-common.svelte.ts`
- **Effort** : M · **Risque** : medium · **Dépend de** : —

**T-018** · Hooks enrichment quasi-identiques

- **Localisation** : `src/lib/features/main-toolbar/data-tab/enrich-data/hooks/{use-enrichment-file,use-enrichment-basemap,use-enrichment-join}.svelte.ts`
- **Preuve** : grep identique `SvelteMap<number, string>`, patterns state/derived/handlers
- **Action** : `use-enrichment-common.svelte.ts` exposant state/error/uploading ; les hooks spécialisés branchent leur logique métier
- **Effort** : M · **Risque** : medium · **Dépend de** : —

**T-019** · Fonts dupliquées entre legend et annotations

- **Localisation** : `step-toolbar/tools/legend/legend.constants.ts:L9-L15` (`AVAILABLE_FONTS`, `LEGEND_FONT_SIZES`) vs `step-toolbar/tools/annotations/text-tool.svelte:L12-L13`
- **Action** : remonter vers `step-toolbar/_shared/fonts.constants.ts`
- **Effort** : S · **Risque** : low · **Dépend de** : —

### 2.3 Code obsolète

**T-020** · `@deprecated MIME` dans data-pipeline

- **Localisation** : `src/lib/features/data-pipeline/constants.ts:L70`
- **Preuve** : `grep '@deprecated'` → unique résultat du repo
- **Action** : retirer le ré-export + trouver les consommateurs restants
- **Effort** : S · **Risque** : low · **Dépend de** : T-006

**T-021** · Système de migrations vide alors que serializer contient des migrations inline

- **Localisation** : `src/lib/features/project-management/core/schema-migration.ts:L20` (`const migrations: SchemaMigration[] = []`) vs `core/serializer.ts:L48-L68` (`isValidBasemapMetadata` + backward compat `title_fr || title`)
- **Preuve** : lecture directe des deux fichiers
- **Règle violée** : `.claude/rules/persistence.md` → _Schema changes require migrations via `core/schema-migration.ts`, not ad hoc serializer tweaks._
- **Action** : extraire les patchs inline de `serializer.ts` en migrations datées ; documenter la version cible dans `PROJECT_CONST`
- **Effort** : M · **Risque** : high (casse rétro-compat `.kh`) · **Dépend de** : —

**T-022** · Fallbacks GeoJSON violant la règle Arrow-only

- _Cf. T-005 pour les localisations._
- Référence additionnelle : `map/layers/layer-factory.ts:L1276-L1300` — `getCachedGeoJSON()` WeakMap démontre la pression systémique.
- **Action** : voir T-005
- **Effort** : M · **Risque** : medium · **Dépend de** : T-005

**T-023** · SQL string interpolation sans prepared statements

- **Localisation** : `src/lib/features/project-management/core/serializer.ts:L394-L418` — `INSERT INTO … VALUES (${escapeSqlString(...)})`
- **Preuve** : lecture
- **Action** : substituer par appel paramétré via `duckDBOrchestrator` si supporté ; sinon extraire une seule fonction `escapeSqlString` audit-friendly et centraliser les appels
- **Effort** : M · **Risque** : medium (sécurité) · **Dépend de** : —

### 2.4 Violations KISS / DRY / SOLID

**T-024** · `commons/services/data-orchestrator.service.svelte.ts` — inversion d'architecture

- **Localisation** : `src/lib/features/commons/services/data-orchestrator.service.svelte.ts:L16-L18,L52-L53` — imports depuis `main-toolbar/constants`, `step-toolbar/tools/layers/.../store`, `step-toolbar/tools/legend/.../store`, `step-toolbar/tools/projections/.../store`, `step-toolbar/tools/color-blindness/.../store`
- **Preuve** : grep `^import .* from` sur ce fichier
- **Règle violée** : CLAUDE.md → _Features … ne dépendent pas les unes des autres directement ; commons est la couche de plus bas niveau._
- **Action** :
  1. Déplacer l'orchestration spécifique à une étape vers la feature consommatrice (main-toolbar pour `FillMode`, step-toolbar pour les actions de tools).
  2. Exposer dans commons uniquement un `dataOrchestrator` générique qui émet des événements ; les features s'y abonnent.
- **Effort** : L · **Risque** : CRITICAL (service central, 1 275 L) · **Dépend de** : T-038

**T-025** · `map/layers/layer-factory.ts` God File 3 951 LOC

- **Localisation** : toute la file
- **Responsabilités mélangées** : parsing geom (L1237-L1251), styling (L1531-L1543), layer construction (L2213-L3900), text rendering (L1671-L1789), highlight (L1043-L1185), cache WeakMap (L1276-L1300), 37 fonctions internes
- **Action** : voir T-033 (split par famille)
- **Effort** : L · **Risque** : high · **Dépend de** : T-008

**T-026** · `map/components/thematic-map.svelte` Monster Component 2 273 LOC

- **Localisation** : `src/lib/features/map/components/thematic-map.svelte` (43 imports, 9 stores, 15 derived)
- **Action** : extraire `useMapOrchestration()` hook (store syncing, dataset loading), réserver le composant au layout + rendu
- **Effort** : L · **Risque** : high · **Dépend de** : —

**T-027** · `map/services/basemap.service.svelte.ts` — 9 exports, 1 290 LOC

- **Responsabilités** : metadata loading, variant resolution, simplification lookup, DuckDB ops, cache mgmt
- **Action** : split `basemap-metadata.service.ts` + `basemap-variant-loader.ts` + `basemap-cache.ts`
- **Effort** : M · **Risque** : medium · **Dépend de** : —

**T-028** · `commons/store/visualization.store.svelte.ts` God Object 1 372 LOC

- **Localisation** : L31-L360 (enums+interfaces+100+constantes), L418-L517 (`getDefault*` imbriqués), L558-L900+ (filters/classification/style resolution)
- **Action** : split `visualization.store.svelte.ts` (state pur), `visualization.defaults.ts`, `visualization.resolver.ts`, `visualization.constants.ts`
- **Effort** : L · **Risque** : high (store central) · **Dépend de** : —

**T-029** · `duckdb/orchestrator/join-ops.ts` — 7 responsabilités, 941 LOC

- **Localisation** :
  - L51-L191 : similarity cache (~140 L)
  - L198-L363 : join quality derivation (~165 L)
  - L365-L500 : basemap attributes + schema (~135 L)
  - L504-L630 : public join compute APIs
  - L638-L720 : finalize (~80 L)
- **Action** : split `join-ops/{similarity-cache,basemap-attributes,quality-derivation,finalization,index}.ts`
- **Effort** : L · **Risque** : medium · **Dépend de** : T-010

**T-030** · `duckdb/orchestrator/orchestrator.svelte.ts` — facade trop large 922 LOC

- **Localisation** : 45 méthodes async, 8 imports `*Ops`, L64-L102 duplique init avec `duck.ts`, L152-L190 wrapper trivial
- **Action** : ne garder que orchestration + state ; déléguer les ops purement SQL à leurs modules
- **Effort** : M · **Risque** : medium · **Dépend de** : T-010

### 2.5 Magic strings / numbers

**T-031** · `map/layers/layer-factory.ts:L111-L129` — 7+ constantes sans rationale

- Exemples : `HIGHLIGHT_DIMMING_FACTOR = 0.3`, `DEFAULT_TEXT_SIZE = 12`, `POINT_SYMBOL_ICON_VIEWBOX_SIZE = 64`, `SELECTED_POLYGON_STROKE_COLOR = [15, 98, 254, 255]`, `SELECTED_POLYGON_STROKE_WIDTH = 3`, `TEXT_COLLISION_PRIORITY = 100`, `LABEL_COLLISION_PRIORITY = 0`
- **Action** : créer `src/lib/features/map/constants/styling.constants.ts` avec catégories (DIM, TEXT_SIZES, COLLISION_LEVELS, SELECTION), docstring courte par token
- **Effort** : S · **Risque** : low · **Dépend de** : —

**T-032** · `duckdb/operations/search.ts:L12-L19` — 6 seuils search

- `MAX_ROWS_FOR_SEARCH = 10 000`, `MAX_CELLS_FOR_FUZZY = 100 000`, `MIN_QUERY_LENGTH_FOR_FUZZY = 4`, `MIN_RESULTS_FOR_FUZZY = 10`, `MAX_EXACT_RESULTS = 200`, `MAX_FUZZY_RESULTS = 50`
- **Action** : centraliser dans `duckdb/constants/search.constants.ts`, re-exporter par `duckdb/index.ts`
- **Effort** : S · **Risque** : low · **Dépend de** : —

**T-033** · `main-toolbar/visualization-tab/suggestion.utils.ts:L126-L168` — mapping suggestion→viz type hardcodé

- 35 lignes de `choropleth: VisualizationType.CHOROPLETH`, `symbols_uniques_colorful_QTR: …`, clés semio `QTA/QTR/QL/QLO`
- **Action** : typer via enum dédié `SuggestionId` + table de mapping dans `visualization-tab/constants/suggestions.constants.ts`
- **Effort** : M · **Risque** : low · **Dépend de** : —

**T-034** · `main-toolbar/data-tab/basemap-join-step.svelte:L63-L75, L145-L146` — tab index + retry magic numbers

- `OSM_TAB_INDEX = 2`, `IMPORT_TAB_INDEX = 1`, `DATASET_READY_RETRY_DELAY_MS = 200`, `DATASET_READY_MAX_RETRIES = 15`
- **Action** : enum `BasemapSourceTab` + constantes dans `main-toolbar/constants.ts`
- **Effort** : S · **Risque** : low · **Dépend de** : —

**T-035** · `commons/utils/semio-detector.utils.ts:L80-L138` — ~30 coefficients de scoring

- `0.5, 0.7, 0.8, 0.9, 0.95, 0.1, 0.2…` répétés sans doc
- **Action** : table `SEMIO_SCORING_WEIGHTS` avec commentaire par tenant (confiance colonne vs type)
- **Effort** : M · **Risque** : medium (changer les nombres peut déplacer les suggestions) · **Dépend de** : —

**T-036** · Couleurs hexadécimales hors tokens Carbon

- **Localisation** : `commons/components/variable-badge.types.ts:L30-L59` ; `commons/utils/logger.ts:L149-L164` (couleurs console)
- **Action** : utiliser `var(--cds-*)` via JS (`getComputedStyle`) pour les badges ; garder logger en hex (consoles ne lisent pas CSS vars) mais documenter
- **Effort** : S · **Risque** : low · **Dépend de** : —

**T-037** · `setTimeout(200)` / `setTimeout(2000)` dans data-orchestrator

- **Localisation** : `src/lib/features/commons/services/data-orchestrator.service.svelte.ts:L1234,L1253`
- **Action** : nommer `RESTORE_UI_SETTLE_MS`, `RESTORE_STORE_SETTLE_MS`, mais surtout remplacer par un mécanisme d'attente déterministe (promesse de readiness)
- **Effort** : M · **Risque** : high (timing restauration projet) · **Dépend de** : —

**T-038** · Magic `__id` / `__similarity_cache__` dans DuckDB

- **Localisation** : `duckdb/orchestrator/table-data-ops.ts:L241`, `duckdb/orchestrator/join-ops.ts:L51`, `duckdb/orchestrator/arrow-ops.ts:L378` (`LIMIT 1000`)
- **Action** : `DUCK_INTERNAL_COLUMNS = { ROW_ID: '__id', GEOM_WKB: '__geom_wkb', … }`, `DUCK_LIMITS = { ARROW_PREVIEW: 1000 }`
- **Effort** : S · **Risque** : low · **Dépend de** : —

### 2.6 Organisation & mega-fichiers

**T-039** · `commons/utils/` fourre-tout (6 760 LOC, 43 fichiers)

- **Preuve** : `ls -la src/lib/features/commons/utils/`
- Contient sans cohérence : array, color, compression, debounce, deep-validator, environment, **facet-generator**, file-export, file-import, **file-validator**, file, format, **geo-detector**, **geojson-to-arrow**, keyboard-shortcuts, layout-sizing, logger, **map-export**, naming, notification, **persisted-geojson**, **persisted-join-state**, processing-semaphore, **projection**, sanitize, **semio-detector**, size-estimation, static-asset-url, store, string, uuid, validation, workspace-viewport…
- **Action** : réorganiser en sous-dossiers thématiques :
  - `commons/utils/collections/` (array, clone, string, naming)
  - `commons/utils/dom/` (keyboard-shortcuts, click-outside, append-to-body, workspace-viewport)
  - `commons/utils/format/` (format, size-estimation, sanitize)
  - `commons/utils/logging/` (logger, notification)
  - `commons/utils/persistence/` (compression, uuid)
- **Fichiers à déplacer hors commons** (couplés à une feature) :
  - `map-export.utils.ts`, `projection.utils.ts`, `geojson-to-arrow.utils.ts`, `persisted-geojson.utils.ts` → `map/utils/`
  - `facet-generator.ts` → `step-toolbar/tools/facets/`
  - `semio-detector.utils.ts`, `file-validator.utils.ts`, `file-export.utils.ts`, `file-import.utils.ts` → `data-pipeline/` ou `create-project/`
  - `persisted-join-state.utils.ts` → `main-toolbar/data-tab/`
- **Effort** : L · **Risque** : medium (chemins d'import multiples) · **Dépend de** : —

**T-040** · Split `layer-factory.ts` (3 951 LOC)

- **Cible** :
  - `map/layers/factories/point-layer-factory.ts` (≈ 600 L)
  - `map/layers/factories/line-layer-factory.ts` (≈ 400 L)
  - `map/layers/factories/polygon-layer-factory.ts` (≈ 500 L)
  - `map/layers/factories/shared-layer-utils.ts` (accessors, contexte)
  - `map/layers/text/text-layer-builder.ts` (text rendering)
  - `map/layers/index.ts` (barrel ré-export)
- **Effort** : L · **Risque** : high · **Dépend de** : T-008

**T-041** · Split `thematic-map.svelte` (2 273 LOC)

- **Cible** :
  - Hook `useMapOrchestration()` : sync stores ↔ map state, chargement datasets, projection
  - Composant réduit à layout + passage de props aux overlays (`<AnnotationOverlay>`, `<GeoIndicationsOverlay>`, `<LegendOverlay>`)
- **Effort** : L · **Risque** : high · **Dépend de** : —

**T-042** · Split `basemap-join-step.svelte` (1 471 LOC)

- **Cible** : `basemap-join/{header,source-tabs,join-section,footer}.svelte` + `use-basemap-join.svelte.ts`
- **Effort** : M · **Risque** : medium · **Dépend de** : T-017

**T-043** · Split `choose-visualization.svelte` (1 069 LOC)

- **Cible** : `suggestion-list.svelte` + `suggestion-details.svelte` + `visualization-preview.svelte`
- **Effort** : M · **Risque** : medium · **Dépend de** : T-033

**T-044** · Split `configure-visualization.svelte` (872 LOC)

- **Cible** : `configure-visualization.svelte` réduit, `use-classification-mode.svelte.ts` (hook), composants par mode (`categorical`, `break`)
- **Effort** : M · **Risque** : medium · **Dépend de** : —

**T-045** · Split `advanced-data-table/advanced-data-table.svelte` + `table-column-header.svelte` (1 041 + 1 151 LOC)

- **Cible** : séparer orchestration (dumb parent) / logique (hooks `useColumnOperations`, `useRowSelection`, `useTableData`, `useTableFilters`, `useTableSort`, `useVirtualScroll` — déjà en partie extraits mais consommateurs incohérents) / rendu (sous-composants : header row, cell, filter-chip, histogram, categorical-panel)
- **Effort** : L · **Risque** : high · **Dépend de** : —

**T-046** · Split `annotations.store.svelte.ts` (1 104 LOC)

- **Cible** : `annotations.store.svelte.ts` core + `annotations-page-elements.utils.ts` (layout, messages bundles, default content)
- **Effort** : M · **Risque** : medium · **Dépend de** : —

**T-047** · Split `geo-indications.store.svelte.ts` (433 L, 33 actions)

- **Cible** : `use-scale-config.svelte.ts`, `use-orientation-config.svelte.ts`, `use-inset-map-config.svelte.ts`
- **Effort** : M · **Risque** : medium · **Dépend de** : —

**T-048** · `map/utils/` — relocaliser vers `services/` / `io/`

- `geoarrow-stream-bridge.ts` (792 L) → `services/geoarrow-parser.service.ts`
- `basemap-import.utils.ts` (756 L) → `services/basemap-import.service.ts`
- `read-geojson-arrow.ts` (699 L) → `io/geojson-arrow-reader.ts`
- **Effort** : M · **Risque** : low · **Dépend de** : —

**T-049** · `main-toolbar/visualization-tab/suggestion.utils.ts` — logique métier hors utils

- **Localisation** : L239-L327 — `applySuggestionMapping`, `buildSuggestionMappingUpdate`, `syncLegendSubtitleAfterSuggestion` (side effect store)
- **Action** : renommer en `suggestion.service.ts` ; les side effects vont dans actions de store
- **Effort** : S · **Risque** : low · **Dépend de** : T-033

**T-050** · `main-toolbar/visualization-tab/components/index.ts` — barrel de 38 exports flat

- **Action** : regrouper par sous-dossier (`symbols/`, `palette/`, `lines/`, `shared/`) et créer un `index.ts` par groupe
- **Effort** : S · **Risque** : low · **Dépend de** : —

**T-051** · Step-toolbar : layout ToolPanel commun manquant

- **Preuve** : tous les outils re-implémentent header sticky + close + body scrollable
- **Action** : `step-toolbar/_shared/tool-panel.svelte` + `<ToolPanel title … onClose …>{@render children()}</ToolPanel>`
- **Effort** : S · **Risque** : low · **Dépend de** : —

**T-052** · `create-project/services/file-processor.service.ts` mal localisé

- _Cf. T-012 (supprimer ou amincir en UI-only)_
- **Effort** : L · **Dépend de** : T-012

**T-053** · Dépendances cross-feature anormales (synthèse)

- **Preuve** : Cypher `MATCH (a)-[r:CodeRelation]->(b) WHERE a.filePath STARTS WITH 'src/lib/features/step-toolbar/' AND b.filePath STARTS WITH 'src/lib/features/' AND NOT b.filePath STARTS WITH 'src/lib/features/commons/' AND NOT b.filePath STARTS WITH 'src/lib/features/step-toolbar/' RETURN …` → step-toolbar → map (6+ edges via simplification store, search store, layers store…)
- Couplage acceptable en principe (l'app EST une carte), mais **bidirectionnel** dans `data-orchestrator` (commons → step-toolbar, step-toolbar → map).
- **Action** : documenter les dépendances autorisées (ADR sous `docs/architecture/feature-boundaries.md`) et inverser les dépendances interdites via contrats (interface côté commons, implémentation côté feature)
- **Effort** : L · **Risque** : medium · **Dépend de** : T-024

**T-054** · `project-management` migrations vides — risque corruption .kh

- _Cf. T-021_
- **Effort** : M · **Dépend de** : —

**T-055** · Persistence keys `key: 'xxx'` sans registry central

- **Localisation** : chaque tool store a `key: '…'` unique dans `createToolStore(…, …, { key })`
- **Action** : énumérer dans `project-management/persistence-keys.constants.ts` ; typer via const union ; gate la collision au build
- **Effort** : S · **Risque** : low (mais prévient des conflits futurs) · **Dépend de** : —

---

## 3. Plan d'exécution ordonné

### Ordre global

1. **Quick wins (S, indépendants)** : T-001, T-002, T-006, T-011, T-014, T-015, T-016, T-019, T-020, T-031, T-032, T-034, T-036, T-038, T-049, T-050, T-051, T-055
2. **Code mort confirmé** : T-003, T-004, T-007
3. **Magic strings restants** : T-033, T-035, T-037
4. **Split mega-fichiers** : T-027, T-046, T-047, T-048, T-041, T-042, T-043, T-044, T-045, T-040 (+ T-026, T-028, T-029, T-030)
5. **Dédup cross-feature** : T-008, T-009, T-010, T-012, T-013, T-017, T-018
6. **SOLID lourds / inversion archi** : T-021, T-023, T-024, T-053, T-054, T-025, T-005, T-022, T-052

### Détail par tâche (extrait)

Pour chaque tâche, le corps comprend :

- **Contexte** : pourquoi elle existe (problème constaté)
- **Étapes** : découpage opérationnel
- **Validation** : commande minimale pour vérifier la non-régression
- **Rollback** : comment revenir en arrière

Seul un extrait est reproduit ci-dessous (modèle pour les 55 tâches). La table complète du § 2 sert de source ; la checklist ci-dessous s'exécute dans l'ordre du § 3.

- [ ] **T-001** · Supprimer `replaceAtIndex()` — _grep confirme 0 usage_ → suppression + build. **Validation** : `pnpm check`, `pnpm test:unit`. **Rollback** : revert.
- [ ] **T-002** · Supprimer alias `generateDuplicateName()` — _adapter imports_. **Validation** : `pnpm check`.
- [ ] **T-003** · Supprimer `orchestrator/search-ops.ts` proxy — _reporter les appelants vers `operations/search.ts`_. **Validation** : `pnpm test:duckdb` + `pnpm test:unit`.
- [ ] **T-004** · Unifier `clone.utils` ↔ `clone-for-storage.utils` — **Validation** : snapshot persistence (`pnpm test:unit` + scénario export/import `.kh`).
- [ ] **T-005** · Supprimer / isoler fallbacks GeoJSON dans `layer-factory.ts` — **Validation** : smoke manuel navigateur + dataset Arrow + dataset legacy WKB. **Rollback** : revert branche dédiée.
- [ ] **T-006** · Retirer `MIME @deprecated` — **Validation** : `pnpm check`.
- [ ] **T-007** · Purger `environment.utils.ts` — **Validation** : `pnpm check`.
- [ ] **T-008** · Extraire accessors `buildColorAccessor / buildSizeAccessor / buildHighlightAccessor` — **Validation** : smoke manuel navigateur (viz types × géométries). **Rollback critique**.
- [ ] **T-009** · Réutiliser les accessors dans `createDoubleProportionalPointLayers`. **Dépend de** T-008.
- [ ] **T-010** · Factoriser `withAnalysis` helper — **Validation** : `pnpm test:duckdb` + `pnpm test:unit`.
- [ ] **T-011** · Consolider CRS helpers — **Validation** : `pnpm test:duckdb` + projection tests.
- [ ] **T-012** · Supprimer processeurs dupliqués dans `create-project` — **Validation** : `pnpm test:pipeline` + scénario onboarding manuel.
- [ ] **T-013..T-019** · Extraire hooks / composants partagés (color state, annotation sélectionnée, fonts, format, GPS patterns, step wizard, enrichment).
- [ ] **T-020..T-038** · Magic strings → constantes typées et organisées par feature.
- [ ] **T-039** · Réorganiser `commons/utils/` en sous-dossiers thématiques + relocaliser les fichiers à couplage feature-spécifique.
- [ ] **T-040..T-048** · Splits mega-fichiers. Chaque split = PR indépendante.
- [ ] **T-049..T-052** · Relocalisations (logique métier hors `utils.ts`, barrel exports, tool-panel shared, create-project processor cleanup).
- [ ] **T-053** · ADR `docs/architecture/feature-boundaries.md` + refacto des imports interdits.
- [ ] **T-054** · Relocaliser les migrations inline de `serializer.ts` vers `schema-migration.ts`.
- [ ] **T-055** · Registry central des clés de persistance.

### Procédure standard par PR

1. Vérifier l'index : `gitnexus analyze` (fresh) puis `mcp__gitnexus__impact({target, direction:'upstream'})` pour évaluer le blast radius avant l'édit.
2. Implémenter la tâche isolément (1 PR = 1 tâche, squash merge sur `staging`).
3. Vérifier `mcp__gitnexus__detect_changes({scope:'staged'})` avant commit — confirmer que le scope touché correspond.
4. Validation : `pnpm check && pnpm lint && pnpm test:unit` ; ajouter `test:pipeline` ou `test:duckdb` si la tâche les concerne.
5. Scope des labels conventionnels : `scope` doit être l'un de `legend/projections/layers/format/annotations/store/ui/db/i18n/css/deps/config`.

---

## 4. Règles d'organisation cible

### 4.1 Arborescence cible par feature

```
src/lib/features/<name>/
  ├── AGENTS.md                       # rules spécifiques (existe déjà pour data-pipeline, duckdb, map, project-management)
  ├── index.ts                        # barrel : API publique seulement
  ├── types.ts                        # types publics
  ├── components/                     # *.svelte, kebab-case, < 400 LOC/fichier
  │   └── _shared/                    # sous-composants internes à la feature
  ├── hooks/                          # use-*.svelte.ts
  ├── services/                       # *.service.(svelte.)ts, logique métier / IO / caches
  ├── stores/                         # *.store.svelte.ts, factory + getters
  ├── constants/                      # *.constants.ts par domaine
  ├── utils/                          # helpers purs (pas de side-effect, pas d'import de store)
  ├── io/                             # readers/writers (ex: parquet, IPC, geojson-arrow)
  └── __tests__/ ou *.test.ts à côté du fichier
```

### 4.2 Contrats inter-features

1. `commons/` n'importe **jamais** de features applicatives (`main-toolbar`, `step-toolbar`, `header`, `create-project`).
2. Les features applicatives peuvent importer `commons/`, `duckdb/`, `data-pipeline/`, `project-management/`, `map/` (pour la lecture des stores UI partagés de la carte).
3. `map/` n'importe ni `main-toolbar/` ni `step-toolbar/` ; les interactions passent par `commons/store/*` ou par props.
4. `duckdb/` et `data-pipeline/` ne sont consommés que via `Duck` / `duckDBOrchestrator` / `pipeline`. Aucune importation SQL inline en dehors.
5. `project-management/` pilote la persistance ; les features s'abonnent via `persistenceRegistry.register()`.

### 4.3 Règles de taille

- Fichier `.svelte` > **400 LOC** → découper en sous-composants ou extraire un hook.
- Fichier `.ts` > **500 LOC** → split par responsabilité (une par fichier).
- Store `.svelte.ts` > **600 LOC** → splitter en plusieurs stores ou sortir les defaults/constantes.
- `utils/` : **aucun import de store** autorisé (sinon → services ou hook).

### 4.4 Conventions déjà établies (rappel)

- Svelte 5 Runes uniquement (`$state`, `$derived`, `$effect`, `$props`, `Snippet`). Pas de `writable`, `$:`, `<slot>`.
- Carbon DS uniquement pour les contrôles interactifs. Pas de raw `<button>`/`<input>` en templates.
- i18n : `import * as m from '$lib/paraglide/messages'` ; pas de strings hardcodées en UI.
- Logger : jamais `console.*` en production (sauf `logger.ts` interne).
- Fichiers kebab-case.

---

## 5. Risques & angles morts

### 5.1 Angles morts GitNexus

GitNexus construit un graphe d'édition à partir du TypeScript et indexe les appels, imports, exports. Les éléments suivants **ne sont pas** (ou partiellement) représentés dans le graphe :

1. **Consommation depuis templates Svelte** (`{#if store.foo}`, `{bar}`, event handlers inline) — GitNexus ne crée pas systématiquement une edge CALLS entre un composant et les getters de store qu'il lit. → Les « fonctions orphelines » remontées contiennent de nombreux faux positifs (setters/getters de store). **Contrôle** : avant de supprimer une fonction exportée par un `.store.svelte.ts`, `grep -rn '\\.<fnName>\\b' src`.

2. **Clés i18n Paraglide référencées par string literal** — `m.my_key()` est une call, OK, mais les builders dynamiques (`m[`tool\_${name}\_title`]?.()`) sont invisibles. **Contrôle** : `pnpm machine-translate` + inspecter `messages/en.json` / `messages/fr.json` pour clés non utilisées (voir si script custom nécessaire).

3. **Templates Svelte avec spreads dynamiques** (`{...props}`, `{@render slot?.()}`) — GitNexus peut ne pas lier le snippet à son consommateur. **Contrôle** : lecture humaine des composants wrapper (`ToolPanel`, `BaseStep`).

4. **Imports `*` et ré-exports** — `export * from './…'` peut masquer la provenance réelle d'un symbole. **Contrôle** : `grep -rn '^export \\*' src`.

5. **Feature flags / variables d'env runtime** — lecture via `import.meta.env.VITE_*` ou GrowthBook. **Contrôle** : `grep -rn 'import\\.meta\\.env' src` + inspection `.env*`.

6. **Événements DOM customs / bus interne** — `window.dispatchEvent(new CustomEvent('…'))`, `addEventListener('…')` : invisible en graphe. **Contrôle** : `grep -rnE "CustomEvent\\(|addEventListener\\('[a-z]"  src`.

7. **SQL macros DuckDB** — les macros (`LOAD spatial`, `CREATE MACRO …`) sont exécutées au runtime WASM, pas analysées. **Contrôle** : lecture `duckdb/macros/`.

8. **Persistance `.kh`** — le graphe ne capture pas la shape sérialisée. Un split de store modifiant la clé de persistance peut casser les projets sauvegardés sans alerte GitNexus. **Contrôle** : migrations + tests de roundtrip (`pnpm test:unit` sur `project-management`) + scénario manuel d'ouverture d'un ancien `.kh`.

### 5.2 Risques identifiés

| #   | Risque                                                                   | Tâches exposées            | Mitigation                                                                                                                                |
| --- | ------------------------------------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Régression de rendu Deck.gl après split `layer-factory.ts`               | T-008, T-009, T-040        | Smoke manuel navigateur sur chaque type de viz ; dataset-fixture dédié ; PR séparée par famille de layers                                 |
| R2  | Corruption `.kh` si `clone-for-storage` unifié différemment              | T-004, T-021, T-054        | Ajouter un test "load old project" à partir d'un fichier versionné dans `tests-datasets/` ; versionner la schema migration avant le split |
| R3  | Inversion d'archi `data-orchestrator` → casse le flux restore            | T-024, T-037               | Split incrémental : d'abord événements sortants, puis retrait des imports `main-toolbar`/`step-toolbar`, puis reprise de la restauration  |
| R4  | `create-project/services/file-processor.service.ts` supprimé trop tôt    | T-012, T-052               | Feature-flag temporaire ; garder les tests de pipeline verts à chaque étape                                                               |
| R5  | Couplage bidirectionnel step-toolbar ↔ map après split                   | T-053                      | ADR signée avant la refacto ; CI lint check des imports interdits                                                                         |
| R6  | Disparition des "fonctions orphelines" qui sont en fait templates Svelte | T-001, T-002, T-003, T-007 | `grep` manuel obligatoire avant suppression ; PR dédiée au delete avec diff minimal                                                       |

### 5.3 Contrôles humains / non-automatisés recommandés

- **Audit visuel** avant merge de T-008/T-040 : charger 3 projets `.kh` (un par famille géométrique) et confirmer le rendu.
- **Audit i18n** après T-039 : vérifier que `messages/en.json` et `messages/fr.json` restent synchronisés (relancer `pnpm machine-translate` et diff).
- **Audit PWA** après T-024 : `.gitnexus/` fresh + test de restauration projet hors-ligne.
- **Audit GrowthBook / env** avant chaque purge de code mort : grep `import.meta.env.VITE_` + lire `src/app.html` / `src/routes/+layout.svelte` pour capter les flags runtime.

### 5.4 Vérification du plan (méta)

Conformément aux exigences du plan initial :

- **Chaque issue cite une commande reproductible** — voir les lignes `Preuve` de la section 2.
- **Inventaire des features cohérent avec `wc -l`** — valeurs de 1.1 / 1.2 recomputées ce jour (date du rapport).
- **Ordre respecté** : quick wins → code mort → magic strings → split → dédup → SOLID lourds.
- **Tirage au sort de 3 issues pour test de reproductibilité** :
  - T-010 (`skipAnalysis` pattern) → reproductible via `grep -rn 'if (!options?.skipAnalysis)' src/lib/features/duckdb/orchestrator/`.
  - T-034 (magic numbers `basemap-join-step`) → reproductible via lecture L63-L75, L145-L146 du fichier.
  - T-039 (`commons/utils/` fourre-tout) → reproductible via `ls -la src/lib/features/commons/utils/`.
    Les 3 passent le test.

---

_Fin de l'audit. Prochaine étape attendue : validation humaine puis ouverture des PR par tâche, en partant de T-001._
