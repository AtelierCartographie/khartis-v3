# Architecture

> Principes fondamentaux et flux de donnees de Khartis v3

**Voir aussi** : [Gestion de l'etat](GESTION_ETAT.md) | [Pipeline de donnees](PIPELINE_DONNEES.md) | [Visualisation](VISUALISATIONS.md)

---

## Flux global

```
Fichier  -->  Validation  -->  DuckDB (read_csv / ST_Read)  -->  DatasetResult
                                                                       |
                                                         Config visualisation
                                                                       |
                                        Arrow table (GeoArrow colonnes binaires)
                                                                       |
                              geoarrow-deck-stream (parse → BinaryPolygonData / BinaryPathData)
                                                                       |
                        ┌─────────────────────────────────────────────┴─────────────────────────┐
                  Mode orthographique                                                    Mode MapLibre (OSM)
             Deck.gl standalone (OrthographicView)                               MapboxOverlay intercalé
          Fond de carte Deck.gl (SolidPolygonLayer)                             Fond de carte tuiles MapLibre
                   + couches thématiques                                              + couches thématiques
                        └─────────────────────────────────────────────┬─────────────────────────┘
                                                                       |
                                               Annotations + Légende + Mise en page (overlay SVG)
                                                                       |
                                                          Export (PNG / SVG / PDF / CSV / GeoJSON)
```

## Les 4 piliers

| Pilier | Description |
|--------|-------------|
| **Confidentialite client-only** | Tout le traitement se fait dans le navigateur (IndexedDB + memoire). Aucun envoi serveur, aucun appel API externe pour les donnees utilisateur. Fonctionne hors-ligne. |
| **Modularite par feature** | Chaque feature dans `src/lib/features/` possede son store, ses composants et ses types. Couplage minimal entre features. |
| **Reactivite Svelte 5 Runes** | `$state` et `$derived` pour l'etat reactif. Mutations explicites via methodes dediees, jamais d'affectation directe. |
| **Rendu GPU-first** | Deck.gl pour les couches thematiques. Deux modes : **orthographique** (Deck.gl standalone, fond vectoriel Deck.gl via GeoArrow binaire) ou **MapLibre interleaved** (MapboxOverlay, fond OSM tuile). Rendu, pan et zoom acceleres par le GPU. |

## Interfaces cles

```ts
interface DataColumn {
  name: string;
  type: ColumnType; // 'text' | 'numeric' | 'date' | 'boolean' | 'geometry'
  stats?: ColumnStats; // min, max, mean, nulls, uniques
}

interface ProcessedDataset {
  id: string;
  name: string;
  columns: DataColumn[];
  rowCount: number;
  geometry?: GeometryInfo; // type, bbox, crs
}

interface Visualization {
  id: string;
  datasetId: string;
  type: VizType; // 'choropleth' | 'proportional' | 'categorical' | 'bivariate'
  classification?: Classification;
  color?: ColorConfig;
}

interface Project {
  id: string;
  datasets: ProcessedDataset[];
  visualizations: Visualization[];
  layout: LayoutConfig;
  settings: ProjectSettings;
}
```

## Couches de stockage

| Couche | Role | Exemple |
|--------|------|---------|
| **Composant local** | Etat ephemere UI | Inputs de formulaire, visibilite modale |
| **Store feature** | Etat domaine canonique | Liste datasets, config visualisation |
| **Store global** | Coordination cross-feature | Metadonnees projet, dataset actif |
| **Persistance** | Stockage long terme | Snapshots IndexedDB, auto-sauvegarde |

**Flux** : Composant --> Store feature --> Store global --> IndexedDB

Voir [Gestion de l'etat](GESTION_ETAT.md) pour le detail de chaque couche.

## Performance

| Defi | Solution |
|------|----------|
| Import de fichiers volumineux | Parsing natif DuckDB + `TABLESAMPLE` pour l'apercu |
| Calculs lourds | DuckDB WASM (thread principal) |
| Geometries complexes | Niveaux de simplification pre-calcules + LOD dynamique |
| Editions rapides | Memoisation `$derived` + recalcul debounce |

**Cibles** :

| Metrique | Objectif |
|----------|----------|
| FCP | < 0.6 s |
| LCP | < 1.0 s |
| TTI | < 1.0 s |
| TBT | 0 ms |
| CLS | 0 |
| Rendu | ~60 fps (datasets petits/moyens) |

## Strategie d'erreur

- **Echouer vite** sur les entrees invalides (validation stricte)
- **Degradation gracieuse** sur les erreurs de calcul (projection par defaut, classification de secours)
- **Ne jamais bloquer l'UI** pour les taches longues (workers + feedback de progression)
- **Messages utilisateur** contextuels et actionnables

## Securite et vie privee

Aucune surface d'attaque serveur : toutes les donnees restent dans le navigateur. Les noms de fichier, cellules CSV et saisies utilisateur sont assainis. Quotas : 50 Mo/fichier, 100 Mo/projet, 50 projets max. CSRF, auth serveur et isolation multi-tenant ne s'appliquent pas.

## Points d'extension

```ts
// Nouveau parser de fichier
type Parser = (file: File) => Promise<RawDataset>;

// Nouvelle methode de classification
interface ClassificationStrategy {
  id: string;
  compute(values: number[], k: number): number[];
}

// Nouveau format d'export
interface Exporter {
  id: string;
  export(project: Project): Promise<Blob>;
}

// Nouveau type de visualisation
interface VizFactory {
  id: string;
  create(dataset: Dataset, config: VizConfig): Visualization;
}
```

| Tache | Point d'entree |
|-------|----------------|
| Nouveau format de fichier | `src/lib/features/data-pipeline/core/parsers.ts` |
| Nouvelle visualisation | `src/lib/features/map/` |
| Nouvelle classification | `src/lib/features/duckdb/macros/breaks.ts` |
| Nouvel outil | `src/lib/features/step-toolbar/tools/<nom-outil>` |

Toutes les extensions s'enregistrent dans leur registre respectif (parser, classification, export, visualisation).

## Accessibilite

- Navigation clavier complete avec indicateurs de focus visibles
- Suggestions de palettes respectant les contrastes WCAG
- Descriptions textuelles des statistiques et de la carte pour les lecteurs d'ecran

## Internationalisation

- **Paraglide** : extraction des messages au build. Cles semantiques (`m.projectCreate()`)
- **Pas de concatenation** : utiliser les parametres de messages
- **Locales** : `fr`, `en`
