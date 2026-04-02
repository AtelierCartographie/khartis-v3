# Fonds de carte

> Préparation, stockage et rendu des fonds de carte vectoriels dans Khartis v3.

Deux types de fonds : les **fonds inclus** préparés par l'Atelier de cartographie, et les **fonds personnalisés** importés par l'utilisateur. Ce document traite la préparation des fonds inclus.

## Principe

Les fonds séparent géométrie et attributs pour optimiser le rendu :

- **Géométrie** — GeoParquet encodé en GeoArrow (pas WKB), lu directement par Deck.gl sans passer par DuckDB
- **Attributs** — table Parquet au format long, importée dans DuckDB pour les jointures avec les données utilisateur
- **Métadonnées** — JSON décrivant le fond (bbox, projection, couches d'habillage)

## Format de la géométrie

Un seul attribut dans le fichier : l'identifiant. Conversion via GDAL :

```bash
# Depuis un GeoJSON
ogr2ogr export.parquet input.json \
    -lco GEOMETRY_NAME=geom \
    -lco GEOMETRY_ENCODING=GEOARROW \
    -lco SORT_BY_BBOX=YES \
    -lco COMPRESSION=ZSTD \
    -lco WRITE_COVERING_BBOX=NO \
    -nlt PROMOTE_TO_MULTI

# Depuis un Shapefile (pas de SORT_BY_BBOX, déjà trié spatialement)
ogr2ogr export.parquet input.shp \
    -lco GEOMETRY_NAME=geom \
    -lco GEOMETRY_ENCODING=GEOARROW \
    -lco COMPRESSION=ZSTD \
    -lco WRITE_COVERING_BBOX=NO \
    -nlt PROMOTE_TO_MULTI
```

| Option                   | Rôle                                                    |
| ------------------------ | ------------------------------------------------------- |
| `GEOMETRY_NAME=geom`     | Cohérence avec DuckDB                                   |
| `SORT_BY_BBOX=YES`       | Fichier plus léger (GeoJSON uniquement)                 |
| `COMPRESSION=ZSTD`       | Bon compromis compression/décompression                 |
| `WRITE_COVERING_BBOX=NO` | Pas besoin de bbox par entité                           |
| `-nlt PROMOTE_TO_MULTI`  | Force un seul type de géométrie (requis par GeoParquet) |

> Documentation : https://gdal.org/en/stable/drivers/vector/parquet.html

## Format des attributs

Les attributs sont stockés au **format long** :

| raw   | id    | variant  | normalized | basemap | basemap_count |
| ----- | ----- | -------- | ---------- | ------- | ------------- |
| FR101 | FR101 | ign_code | fr101      | FR_DPT  | 101           |
| Ain   | FR101 | name     | ain        | FR_DPT  | 101           |

Chaque variante d'identifiant (nom, code ISO, code officiel) est une ligne distincte. Le `basemap_count` sert au calcul du taux de réussite de jointure.

### Normalisation des identifiants

Macro SQL DuckDB pour le matching flou :

```sql
CREATE OR REPLACE MACRO normalize_text(string) AS (
    SELECT nfc_normalize(string)
            .strip_accents().lower().trim()
            .regexp_replace('[^a-z0-9]+', ' ', 'g')
            .regexp_replace('\bste\.?\b', 'sainte', 'g')
            .regexp_replace('\bst\.?\b', 'saint', 'g')
);
```

### Passage format large → long

```sql
CREATE OR REPLACE MACRO reshape_attributes(table_name, basemap_name, id_col) AS TABLE (
  WITH
    nb AS (FROM query_table(table_name) SELECT basemap_count: count(*)),
    attr_with_id AS (FROM query_table(table_name) SELECT id: id_col, *),
    attr_long AS (
      UNPIVOT attr_with_id ON COLUMNS(* EXCLUDE id)
        INTO NAME variant VALUE raw
    )
  FROM attr_long, nb
  SELECT raw, id, variant, normalized: normalize_text(raw), basemap: basemap_name, basemap_count
);
```

## Métadonnées

Chaque fond inclut un fichier JSON de métadonnées :

```json
{
  "file": "france-commune-2025-medium",
  "title_fr": "France > communes",
  "title_en": "France > communes",
  "description_fr": "Communes françaises — ADMIN EXPRESS COG CARTO 2025",
  "description_en": "French communes — ADMIN EXPRESS COG CARTO 2025",
  "source": "IGN — ADMIN EXPRESS COG CARTO",
  "date": "2025",
  "bbox": [-61.81, -21.39, 55.84, 51.09],
  "proj_source": "EPSG:4326",
  "proj_to": { "type": "composite", "preset": "FRANCE_DOM_TOM" },
  "layers": [...]
}
```

### Types de projection (`proj_to`)

| Type        | Description                                                                             | `proj_source`                  |
| ----------- | --------------------------------------------------------------------------------------- | ------------------------------ |
| `composite` | Projection composite avec encarts DOM-TOM. `preset` référence `projection-presets.json` | `EPSG:4326`                    |
| `simple`    | Projection unique via `proj4d3(proj_to.proj4)`                                          | `EPSG:4326`                    |
| `identity`  | Données pré-projetées, pas de reprojection → `geoIdentity()`                            | CRS effectif (ex: `EPSG:2154`) |

### Types de couches (`layers`)

| Type               | Source          | Description                                      |
| ------------------ | --------------- | ------------------------------------------------ |
| `centroid`         | fichier Parquet | Points centroïdes des entités                    |
| `limit`            | fichier Parquet | Lignes de frontières/limites                     |
| `land`             | fichier Parquet | Polygone de territoire (fond)                   |
| `graticule`        | fichier Parquet | Méridiens et parallèles (généré avec mapshaper) |
| `geographic-lines` | fichier Parquet | Équateur, tropiques, cercles polaires, Greenwich |

Génération d'un fichier graticule :

```bash
mapshaper -graticule interval=10 -o tmp/graticule-10.json
ogr2ogr graticule-10.parquet tmp/graticule-10.json \
    -lco GEOMETRY_NAME=geom -lco GEOMETRY_ENCODING=GEOARROW \
    -lco COMPRESSION=ZSTD -lco WRITE_COVERING_BBOX=NO -nlt PROMOTE_TO_MULTI
```

## Presets

Les presets sont dans `presets/` et exportés à la racine d'`export/`.

### `projection-presets.json`

Projections composites avec encarts. Chaque entrée contient :

| Champ             | Description                                                   |
| ----------------- | ------------------------------------------------------------- |
| `id`              | Identifiant de l'entrée                                       |
| `proj4`           | Chaîne proj4 pour `proj4d3()`                                 |
| `bounds`          | Étendue géographique `[[minLon, minLat], [maxLon, maxLat]]`   |
| `layout`          | Position et taille relatives `{ x, y, width, height }` (0–1)  |
| `scaleMultiplier` | Facteur de grossissement (optionnel, pour petits territoires) |

Presets disponibles : **FRANCE_DOM_TOM** (Lambert-93 + 6 encarts), **EUROPE_DOM_TOM** (ETRS89-LAEA + 6 encarts).

### `style-presets.json`

Styles visuels des couches d'habillage. Clés : `limit-level-0/1/2`, `land`, `nuts-land`, `graticule`, `geographic-lines`. Les styles `path` exposent `width`, `color` (RGBA). Les styles `solid-polygon` exposent `fillColor`, `stroked`.

## Structure finale

```
basemaps/
├── presets/
│   ├── projection-presets.json
│   └── style-presets.json
├── france/ europe/ monde/
│   └── .../3-processed/*.json         ← métadonnées individuelles
└── export/                            ← généré par script-export.sh
    ├── all-basemaps-metadata.json     ← catalogue global
    ├── all-basemaps-attributes.parquet ← attributs concaténés
    ├── projection-presets.json
    ├── style-presets.json
    └── geometry/*.parquet             ← fichiers GeoParquet
```

## Lecture dans Deck.gl

La librairie `geoarrow-deck-stream` transforme les géométries GeoArrow en buffers binaires pour Deck.gl, avec reprojection via d3-geo.

```typescript
// Chargement
import { readGeoParquet } from '@geoarrow/geoparquet-wasm';
import { tableFromIPC } from 'apache-arrow';
const table = tableFromIPC(
  readGeoParquet(new Uint8Array(buffer)).intoIPCStream()
);

// Données pré-projetées (identity) → geoIdentity(), rewind: false
// Projection composite → buildCompositeProjection() avec les entrées du preset
```

### Jointure avec les données utilisateur

Le champ `featureIds` permet de retrouver la ligne Arrow source pour chaque vertex, même après découpage aux bords de projection :

```typescript
const geoKeys = table.getChild('code');
const userDataMap = new Map(userRows.map((row) => [row.code, row.value]));

new SolidPolygonLayer({
  ...createSolidPolygonLayerProps(data),
  getFillColor: (_, { index }) => {
    const key = geoKeys.get(data.featureIds[index]);
    return userDataMap.get(key)
      ? colorScale(userDataMap.get(key))
      : [200, 200, 200];
  },
  updateTriggers: { getFillColor: [userDataMap] }
});
```

## Prérequis

- GDAL 3.9+
- DuckDB 1.1+ (`INSTALL spatial; LOAD spatial;`)
- mapshaper (pour les graticules)

---

**Voir aussi :** [VISUALISATIONS.md](./VISUALISATIONS.md) — [ARCHITECTURE.md](./ARCHITECTURE.md) — [GLOSSAIRE.md](./GLOSSAIRE.md)
