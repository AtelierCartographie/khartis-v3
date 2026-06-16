# Architecture

> Vue d'ensemble du système Khartis v3 : principes, couches techniques et flux de données.

**Voir aussi** : [ARCHITECTURE_FEATURES.md](ARCHITECTURE_FEATURES.md) · [GUIDE_DEVELOPPEUR.md](GUIDE_DEVELOPPEUR.md) · [PIPELINE_DONNEES.md](PIPELINE_DONNEES.md) · [DUCKDB.md](DUCKDB.md) · [MAP.md](MAP.md) · [GESTION_ETAT.md](GESTION_ETAT.md)

---

## Les 4 piliers

| Pilier                   | Description                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client-only**          | Tout le traitement s'exécute dans le navigateur (DuckDB WASM + mémoire + IndexedDB). Aucun envoi de données à un serveur. Fonctionne hors-ligne après le premier chargement.                |
| **Feature-based layout** | Chaque feature dans `src/lib/features/` possède ses propres stores, composants et types. Les features ne se couplent pas directement : elles passent par `commons/` ou des APIs explicites. |
| **DuckDB-first**         | Tout traitement de données (import, jointure, classification, reprojection, agrégation, recherche) passe par DuckDB WASM. Pas de parsers JavaScript pour les formats que DuckDB gère.       |
| **GPU-first**            | Les couches thématiques sont rendues par Deck.gl via des buffers GeoArrow binaires uploadés directement en VRAM. GeoJSON n'est utilisé qu'en fallback ou pour l'export.                     |

---

## Flux global

```
Fichier utilisateur
    └─ validateFile()              ← vérification extension + taille
        └─ DuckDB (read_csv / ST_Read / read_parquet)
            └─ buildDatasetFromDuckTable()
                └─ DatasetResult (Arrow table en mémoire)
                    └─ geoarrow-deck-stream  ← parsing binaire
                        └─ BinaryPolygonData / BinaryPathData / BinaryPointData
                            ├─ Mode orthographique  → Deck.gl standalone (OrthographicView)
                            └─ Mode MapLibre        → MapboxOverlay (WebMercator / Globe)
                                └─ SVG overlay      ← annotations, légende, habillage
                                    └─ Export (PNG / SVG / CSV / GeoJSON / .kh)
```

Deux modes de rendu coexistent selon le fond de carte actif :

- **Orthographique** : Deck.gl en mode `OrthographicView`, projections d3-geo appliquées par `geoarrow-deck-stream`. Les couches du catalogue (GeoParquet) sont parsées avec reprojection.
- **MapLibre interleaved** : `MapboxOverlay({ interleaved: true })`, fond OSM en tuiles vectorielles, projections Web Mercator ou Globe gérées par MapLibre.

---

## Couches techniques

| Couche              | Rôle                                           | Durée de vie         | Implémentation                                                                                       |
| ------------------- | ---------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| **Composant local** | État UI éphémère (inputs, modales)             | Montage du composant | `$state` dans le `.svelte`                                                                           |
| **Store feature**   | Modèle de domaine d'une feature                | Session navigateur   | `$state` dans `.store.svelte.ts`                                                                     |
| **Store global**    | Coordination entre features                    | Session navigateur   | Singleton exporté (`projectStore`, etc.)                                                             |
| **DuckDB WASM**     | Tables SQL en mémoire, calculs, jointures      | Session navigateur   | Accès via `Duck` ou `duckDBOrchestrator`                                                             |
| **IndexedDB**       | Projets, métadonnées et assets binaires source | Persistant           | Object stores `projects`, `metadata`, `project_assets`, `project_asset_chunks`, `project_asset_refs` |

Le flux de persistence : `mutation d'état → store → persistenceRegistry → sérialisation metadata-only → IndexedDB`. Les fichiers source ne sont **pas** sérialisés dans le JSON projet ; ils vivent dans `project_asset_chunks` (chunks 8 Mo) et sont rejoués dans DuckDB à la réouverture.

---

## Structure du projet

```
src/
├── routes/
│   ├── +layout.svelte       # Init DuckDB, ARIA Carbon, zoom/pan global
│   └── +page.svelte         # Chargement lazy de la carte
└── lib/
    ├── features/            # 12 features indépendantes (voir ci-dessous)
    ├── paraglide/           # Messages i18n générés (FR/EN) — ne pas éditer
    └── types/               # Types TypeScript partagés cross-features
```

### Les 12 features

| Feature               | Rôle                                                                          |
| --------------------- | ----------------------------------------------------------------------------- |
| `commons/`            | Stores globaux, services partagés, composants Carbon, erreurs, utilitaires    |
| `create-project/`     | Modale de création : import fichier, exemples, ouverture projet               |
| `data-pipeline/`      | Import fichiers : détection format, validation, processeurs, DuckDB           |
| `data-tab/`           | Onglet « Données » du panneau gauche : import, jointure, enrichissement       |
| `duckdb/`             | Moteur DuckDB WASM : singleton `Duck`, orchestrateur, macros SQL              |
| `header/`             | Barre de navigation supérieure (export, sauvegarde projet)                    |
| `main-toolbar/`       | Coquille du panneau gauche : orchestre `data-tab/` et `visualization-tab/`    |
| `map/`                | Carte Deck.gl + MapLibre : hooks, layer factories, projections, tooltip       |
| `project-management/` | Format `.kh`, sérialisation, asset store IndexedDB, import/export             |
| `side-nav/`           | Menu latéral (langue, liste des projets récents)                              |
| `step-toolbar/`       | Panneau droit : 10 outils (search, layers, projections, legend, annotations…) |
| `visualization-tab/`  | Onglet « Visualisations » : suggestions, primitives, fond de carte            |

Chaque feature expose son API publique via `index.ts`. Les imports inter-features doivent passer par ce barrel ; les imports profonds dans les internes d'une autre feature sont interdits (vérifié par `architecture-boundaries.svelte.test.ts`).

> Pour comprendre **pourquoi** chaque feature est organisée comme elle l'est et savoir comment structurer une nouvelle feature, voir [ARCHITECTURE_FEATURES.md](ARCHITECTURE_FEATURES.md).

---

## Points d'entrée principaux

| Besoin                           | Symbole                                               | Fichier                                                       |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| Traitement de fichiers           | `dataPipeline.processFile()`                          | `src/lib/features/data-pipeline/index.ts`                     |
| Requêtes SQL (bas niveau)        | `Duck.query()`                                        | `src/lib/features/duckdb/duck.ts`                             |
| Opérations données (haut niveau) | `duckDBOrchestrator`                                  | `src/lib/features/duckdb/orchestrator/`                       |
| Stores globaux                   | `projectStore`, `datasetsStore`, `visualizationStore` | `src/lib/features/commons/stores/`                            |
| Rendu carte                      | `useMapLayers`, `useMapInit`, `useMapBasemap`         | `src/lib/features/map/hooks/`                                 |
| Classification                   | `calculateBreaks()`, `generateColorsForBreaks()`      | `src/lib/features/commons/services/classification.service.ts` |
| Suggestion de visualisation      | `vizSuggester.suggestVisualizations()`                | `src/lib/features/commons/services/viz-suggester.service.ts`  |
| Messages i18n                    | `import * as m from '$lib/paraglide/messages'`        | `messages/fr.json`, `messages/en.json`                        |

---

## Pipeline de géométrie

Les fonds de carte et les données utilisateur suivent des chemins distincts :

**Fonds du catalogue (GeoParquet)** :

```
GeoParquet fichier → parquet-wasm → Arrow table → geoarrow-deck-stream → Deck.gl
```

Ce chemin ne passe jamais par DuckDB — c'est délibéré pour la performance.

**Données utilisateur (tous formats)** :

```
Fichier → DuckDB (read_csv / ST_Read / read_parquet) → Arrow IPC → geoarrow-deck-stream → Deck.gl
```

**Règle** : rester sur des chemins binaires pour le rendu. Dès qu'une conversion GeoJSON JavaScript intervient sur le chemin de rendu, la performance chute et les WeakMap caches sont invalidés.

---

## Gestion des erreurs

Khartis applique une stratégie d'erreur cohérente à travers tout le pipeline :

- **Échouer vite** sur les entrées invalides : validation stricte de l'extension, de la taille et de la structure du fichier avant d'engager DuckDB.
- **Dégradation gracieuse** sur les erreurs de calcul : projection fallback équirectangulaire si une projection est indisponible ; retry CSV avec `ignore_errors=true` si zéro ligne est retournée.
- **Ne jamais bloquer l'interface** pour les tâches longues : toutes les opérations DuckDB sont asynchrones, le feedback de progression est envoyé par callback.
- **Messages utilisateur** : toutes les erreurs remontées à l'UI passent par le système de notifications (`showError` / `showWarning`), localisées via Paraglide.

La hiérarchie d'erreurs (`PipelineError` → `DataValidationError` | `ParseError` | `DuckDBError` | `NonFatalError`) est définie dans `src/lib/features/commons/pipeline.errors.ts`.

---

## Internationalisation

Paraglide JS 2 extrait les messages au moment du build (pas de runtime i18n). Les clés sont définies dans `messages/fr.json` et `messages/en.json`, puis compilées en fonctions TypeScript typées dans `src/lib/paraglide/`.

```typescript
import * as m from '$lib/paraglide/messages';

// Usage dans un composant
m.pipeline_warning_no_data_rows(); // clé sans paramètre
m.create_project_processing_file({ name }); // clé avec paramètre
```

Conventions : `snake_case` sémantique par domaine (`tool_legend_title`, `pipeline_error_file_too_large`). Ne jamais éditer les fichiers générés dans `src/lib/paraglide/`. Toujours mettre à jour FR et EN ensemble.

---

## Accessibilité et sécurité

**Accessibilité** : navigation clavier complète avec indicateurs de focus visibles (Carbon Design System). Les contrôles icône-seule exposent un label accessible. Les palettes de couleurs respectent les contrastes WCAG. Les statistiques et légendes disposent de descriptions textuelles pour les lecteurs d'écran.

**Sécurité** : surface d'attaque serveur nulle — toutes les données restent dans le navigateur. Les noms de fichiers, cellules CSV et saisies utilisateur sont assainis avant toute opération. Les expressions SQL calculées par l'utilisateur passent par `validateExpression()` qui rejette les sous-requêtes, les multi-statements et les appels de fonction dangereux. Quotas : 150 Mo (formats texte/geo), 200 Mo (formats binaires), 50 projets maximum.

---

## Performances cibles

| Métrique                | Objectif |
| ----------------------- | -------- |
| FCP                     | < 0,6 s  |
| LCP                     | < 1,0 s  |
| TTI                     | < 1,0 s  |
| Rendu interactif        | ~60 fps  |
| Import fichier standard | < 3 s    |

Les leviers principaux : parsing natif DuckDB (évite les JS parsers), buffers GeoArrow binaires (upload GPU direct), caches WeakMap sur les Arrow tables filtrées (pas de recalcul si les données n'ont pas changé), LOD dynamique sur les fonds complexifiés.
