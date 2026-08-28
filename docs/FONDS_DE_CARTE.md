# Fonds de carte

> Format, préparation et runtime des fonds vectoriels. Les fonds du catalogue sont des GeoParquet + Parquet attributs préparés hors-ligne ; les fonds personnalisés sont importés à l'exécution via DuckDB.

**Voir aussi** : [ARCHITECTURE.md](ARCHITECTURE.md) · [DUCKDB.md](DUCKDB.md) · [MAP.md](MAP.md) · [CARTOGRAPHIE.md](CARTOGRAPHIE.md)

---

## Deux familles de fonds

| Famille          | Source                                                  | Pipeline                                                                     |
| ---------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Catalogue**    | Préparé par l'Atelier de cartographie, livré avec l'app | GeoParquet → parquet-wasm → Arrow IPC → geoarrow-deck-stream (jamais DuckDB) |
| **Personnalisé** | Importé à l'exécution par l'utilisateur                 | DuckDB `ST_Read()` → nettoyage → couches POLYGON/LINE/POINT + CENTROID       |

Le pipeline runtime (WeakMap caches, projections, picking) est dans [MAP.md](MAP.md). Ce document se concentre sur la **préparation des fichiers** et leur **format sur disque**.

---

## Format de géométrie — GeoArrow via GDAL

Les fichiers de géométrie du catalogue sont des **GeoParquet encodés en GeoArrow** (pas WKB). Cela permet un upload GPU direct sans parsing côté CPU.

Commandes de conversion :

```bash
# Depuis GeoJSON
ogr2ogr export.parquet input.json \
    -lco GEOMETRY_NAME=geom \
    -lco GEOMETRY_ENCODING=GEOARROW \
    -lco SORT_BY_BBOX=YES \
    -lco COMPRESSION=ZSTD \
    -lco WRITE_COVERING_BBOX=NO \
    -nlt PROMOTE_TO_MULTI

# Depuis Shapefile (pas de SORT_BY_BBOX — déjà trié spatialement)
ogr2ogr export.parquet input.shp \
    -lco GEOMETRY_NAME=geom \
    -lco GEOMETRY_ENCODING=GEOARROW \
    -lco COMPRESSION=ZSTD \
    -lco WRITE_COVERING_BBOX=NO \
    -nlt PROMOTE_TO_MULTI
```

| Option GDAL                  | Effet                                                           |
| ---------------------------- | --------------------------------------------------------------- |
| `GEOMETRY_NAME=geom`         | Cohérence avec le nom attendu par DuckDB Spatial                |
| `GEOMETRY_ENCODING=GEOARROW` | Colonnes Float64Array contiguës au lieu de WKB BLOB             |
| `SORT_BY_BBOX=YES`           | Tri spatial pour meilleure compressibilité (GeoJSON uniquement) |
| `COMPRESSION=ZSTD`           | Bon ratio compression / décompression navigateur                |
| `WRITE_COVERING_BBOX=NO`     | Bbox par entité inutile côté client                             |
| `-nlt PROMOTE_TO_MULTI`      | Type de géométrie homogène (requis par GeoParquet)              |

Prérequis : GDAL 3.9+.

---

## Format des attributs — Parquet long

Les attributs sont séparés de la géométrie et stockés en **format long** (une ligne par variante d'identifiant) :

```
raw     | id    | variant   | normalized | basemap | basemap_count
--------|-------|-----------|------------|---------|---------------
FR101   | FR101 | ign_code  | fr101      | FR_DPT  | 101
Ain     | FR101 | name      | ain        | FR_DPT  | 101
01      | FR101 | insee     | 01         | FR_DPT  | 101
```

Chaque variante (nom officiel, code ISO, code IGN, etc.) occupe une ligne distincte. `basemap_count` est le nombre total d'entités du fond — utilisé pour calculer le taux de réussite de jointure.

### Macro de normalisation

Les valeurs `normalized` sont précalculées avec cette macro SQL DuckDB :

```sql
CREATE OR REPLACE MACRO normalize_text(string) AS (
    SELECT nfc_normalize(string)
            .strip_accents().lower().trim()
            .regexp_replace('[^a-z0-9]+', ' ', 'g')
            .regexp_replace('\bste\.?\b', 'sainte', 'g')
            .regexp_replace('\bst\.?\b', 'saint', 'g')
);
```

### Macro de reshape (large → long)

```sql
CREATE OR REPLACE MACRO reshape_attributes(table_name, basemap_name, id_col) AS TABLE (
  WITH
    nb       AS (FROM query_table(table_name) SELECT basemap_count: count(*)),
    with_id  AS (FROM query_table(table_name) SELECT id: id_col, *),
    long     AS (UNPIVOT with_id ON COLUMNS(* EXCLUDE id) INTO NAME variant VALUE raw)
  FROM long, nb
  SELECT raw, id, variant,
         normalized: normalize_text(raw),
         basemap: basemap_name,
         basemap_count
);
```

`query_table()` (DuckDB) permet de paramétrer le nom de table dynamiquement dans une macro — nécessaire pour reshaper plusieurs fonds via la même macro.

---

## Métadonnées — JSON par fond

Chaque fond est décrit par un fichier JSON de métadonnées :

```json
{
  "file": "france-commune-2025-high",
  "title_fr": "France > communes",
  "title_en": "France > communes",
  "description_fr": "Communes françaises — ADMIN EXPRESS COG CARTO 2025",
  "source": "IGN — ADMIN EXPRESS COG CARTO",
  "date": "2025",
  "bbox": [-61.81, -21.39, 55.84, 51.09],
  "proj_source": "EPSG:4326",
  "proj_to": { "type": "composite", "preset": "FRANCE_DOM_TOM" },
  "layers": [...]
}
```

### Types de projection (`proj_to`)

| Type        | Comportement                                                                    | `proj_source`                  |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------ |
| `composite` | Projection composite avec encarts. `preset` référence `projection-presets.json` | `EPSG:4326`                    |
| `simple`    | Projection unique via `proj4d3(proj_to.proj4)`                                  | `EPSG:4326`                    |
| `identity`  | Données pré-projetées, pas de reprojection → `geoIdentity()`                    | CRS effectif (ex. `EPSG:2154`) |

### Types de couches (`layers`)

| Type               | Source  | Contenu                                                      |
| ------------------ | ------- | ------------------------------------------------------------ |
| `centroid`         | Parquet | Points centroïdes des entités (pour textes et symboles)      |
| `limit`            | Parquet | Lignes de frontières / limites                               |
| `land`             | Parquet | Polygones de territoire                                      |
| `graticule`        | Parquet | Méridiens et parallèles                                      |
| `geographic-lines` | Parquet | Équateur, tropiques, cercles polaires, méridien de Greenwich |

Les couches `centroid` sont le chemin nominal pour les primitives Textes et Symboles sur les géométries non-ponctuelles — ce sont des tables DuckDB distinctes, pas un fallback JS.

---

## Variantes de simplification

Chaque fond du catalogue peut exister en 3 niveaux : `low`, `medium`, `high`. Comportements :

- Khartis préfère `medium`, puis `high`, puis `low`.
- Les fonds administratifs France (canton, commune, département, région) **n'existent qu'en `high`** dans `static/basemaps/geometry/` : l'outil de simplification n'affiche que les niveaux réellement disponibles, ou un message si une seule variante existe.
- Les couches annexes (graticule, geographic-lines) peuvent partager le même fichier entre niveaux.

---

## Presets

### `projection-presets.json`

Projections composites avec encarts DOM-TOM. Chaque entrée :

| Champ             | Type                                   | Description                                      |
| ----------------- | -------------------------------------- | ------------------------------------------------ |
| `id`              | string                                 | Identifiant (`FRANCE_DOM_TOM`, `EUROPE_DOM_TOM`) |
| `proj4`           | string                                 | Chaîne PROJ.4 pour `proj4d3()`                   |
| `bounds`          | `[[minLon, minLat], [maxLon, maxLat]]` | Étendue géographique                             |
| `layout`          | `{ x, y, width, height }` (0–1)        | Position et taille relatives                     |
| `scaleMultiplier` | number?                                | Facteur d'agrandissement pour petits territoires |

Presets actuels : **FRANCE_DOM_TOM** (Lambert-93 + 6 encarts) et **EUROPE_DOM_TOM** (ETRS89-LAEA + 6 encarts).

### `style-presets.json`

Styles par défaut des 9 couches d'habillage : `limit-level-0/1/2`, `land`, `nuts-land`, `graticule`, `geographic-lines`. Styles `path` : `{ width, color: RGBA }`. Styles `solid-polygon` : `{ fillColor, stroked }`.

---

## Structure du catalogue sur disque

```
static/basemaps/
├── presets/
│   ├── projection-presets.json
│   └── style-presets.json
├── france/ europe/ monde/
│   └── .../3-processed/*.json        ← métadonnées individuelles
└── export/                           ← généré par script-export.sh
    ├── all-basemaps-metadata.json    ← catalogue global (29 fonds)
    ├── all-basemaps-attributes.parquet ← attributs concaténés tous fonds
    ├── projection-presets.json
    ├── style-presets.json
    └── geometry/*.parquet            ← GeoParquet par couche
```

`all-basemaps-metadata.json` est chargé au démarrage et popule le catalogue UI. Le catalogue versionné contient actuellement **207 variantes de fichiers**, regroupées en **183 familles affichées** par `getCatalogBasemapsForDisplay()` afin de ne présenter qu'un niveau de simplification préféré par famille. `all-basemaps-attributes.parquet` n'est **pas** chargé au démarrage : il est enregistré dans DuckDB par `basemapService.ensureAttributesLoaded()` uniquement quand l'utilisateur déclenche une jointure.

---

## Génération d'un graticule

Outils requis : mapshaper + GDAL.

```bash
mapshaper -graticule interval=10 -o tmp/graticule-10.json
ogr2ogr graticule-10.parquet tmp/graticule-10.json \
    -lco GEOMETRY_NAME=geom \
    -lco GEOMETRY_ENCODING=GEOARROW \
    -lco COMPRESSION=ZSTD \
    -lco WRITE_COVERING_BBOX=NO \
    -nlt PROMOTE_TO_MULTI
```

---

## Pipeline d'import de fond personnalisé (runtime)

Quand un utilisateur importe un fichier géo comme fond personnalisé, `basemap-import.utils.ts` déclenche un pipeline DuckDB :

**Polygones** :

```
ST_Read() → table_raw
  → simplify_and_clean(table, geom, tolerance)   → table_clean
  → extract_innerlines(table_clean)              → table_innerlines
  → ST_MaximumInscribedCircle(table_clean)       → table_centroids
```

Résultat : 3 couches (POLYGON, LIMIT, CENTROID).

**Lignes** :

```
Clone source
  → simplify_and_clean_linestring(table, geom, 0.0)  → géométries nettoyées
  → ST_PointOnSurface()                              → table_centroids
```

Résultat : 2 couches (LINE, CENTROID).

**Points** :

```
Géométries source inchangées
  → ST_PointOnSurface()  → table_centroids
```

Résultat : 2 couches (POINT, CENTROID).

Les fonds personnalisés importés ne passent jamais par le cache GeoParquet → parquet-wasm. Ils restent dans DuckDB et sont consommés via `getArrowTable()` comme les données utilisateur.

---

## Jointure runtime

`basemapService.ensureAttributesLoaded()` enregistre `all-basemaps-attributes.parquet` dans DuckDB si ce n'est pas déjà fait. La jointure et son cache de similarité sont orchestrés par `join-ops.ts`. Voir [DUCKDB.md — Jointures](DUCKDB.md).

---

## Prérequis de préparation

| Outil     | Version                                 | Usage                               |
| --------- | --------------------------------------- | ----------------------------------- |
| GDAL      | 3.9+                                    | Conversion GeoJSON/SHP → GeoParquet |
| DuckDB    | 1.1+ (`INSTALL spatial; LOAD spatial;`) | Reshaping des attributs             |
| mapshaper | Dernière stable                         | Génération des graticules           |
