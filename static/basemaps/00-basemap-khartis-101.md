# Fonds de cartes pour Khartis v3

On peut distinguer deux types de fonds de cartes dans Khartis v3 :

- **les fonds inclus par défaut et préparés par l'Atelier de cartographie**
- les fonds personnalisés que l'utilisateur peut importer

> Ce document traite le processus de préparation des fonds inclus par défaut.

## Objectifs

- des fichiers légers
- un rendu rapide avec DeckGL
- prendre en compte des identifiants multiples
- faciliter l'étape de jointure

Pour se faire, les fonds sont séparés entre géométrie et attributs.
La géométrie réduite à son strict minimum (un identifiant) pourra directement être lu par DeckGL tandis que les attributs seront importés dans DuckDB pour la jointure avec les données de l'utilisateur.

## Format de la géométrie

La géométrie est stockée au format geoparquet avec la colonne de géométrie encodée en geoarrow plutôt que WKB. L'idée est de minimiser la taille du fichier et d'accélérer le rendu dans Khartis sans avoir à passer par un import dans DuckDB et donc une lecture directe dans DeckGL.
Un seul attribut est présent : l'identifiant.

GDAL est en mesure de générer ce format.  
Depuis un geojson :

```shell
ogr2ogr export.parquet input.json
    -lco GEOMETRY_NAME=geom
    -lco GEOMETRY_ENCODING=GEOARROW
    -lco SORT_BY_BBOX=YES
    -lco COMPRESSION=ZSTD
    -lco WRITE_COVERING_BBOX=NO
    -nlt PROMOTE_TO_MULTI
```

Depuis un shapefile :

```shell
ogr2ogr export.parquet input.json
    -lco GEOMETRY_NAME=geom
    -lco GEOMETRY_ENCODING=GEOARROW
    -lco COMPRESSION=ZSTD
    -lco WRITE_COVERING_BBOX=NO
    -nlt PROMOTE_TO_MULTI
```

- `GEOMETRY_NAME=geom` pour être cohérent avec ce que fait DuckDB qui nomme la colonne de géométrie ‘geom’.
- `SORT_BY_BBOX=YES` rend parfois le fichier un peu plus léger. À appliquer seulement à partir d’un geojson, car un shapefile ou un geopackage est déjà trié spatialement.
- `WRITE_COVERING_BBOX=NO` Pas besoin d’ajouter une colonne avec la bbox de chaque objet.
- `COMPRESSION=ZSTD` pour compresser le fichier. Le format Parquet supporte plusieurs algorithmes de compression. ZSTD est un bon compromis entre taux de compression et vitesse de décompression.
- `-nlt PROMOTE_TO_MULTI` en cas de géométries mixtes, force tout en Multi. Avec GeoParquet, un seul type de géométrie est autorisée.

> Documentation : https://gdal.org/en/stable/drivers/vector/parquet.html

## Format des attributs

Les attributs sont stockés à part au format long selon la structure suivante :

| raw   | id    | variant  | normalized | basemap | basemap_count |
| ----- | ----- | -------- | ---------- | ------- | ------------- |
| FR101 | FR101 | ign_code | fr101      | FR_DPT  | 101           |
| FR102 | FR102 | ign_code | fr102      | FR_DPT  | 101           |
| FR103 | FR103 | ign_code | fr103      | FR_DPT  | 101           |

Cette structure est à générer à partir d'un format large classique où chaque ligne est une entité du fond et chaque colonne une variante d'identifiant.
Le compte du nombre d'entité dans le fond (`basemap_count`) sert à rapporter le taux de réussite d'une opération de jointure avec ce fond.

Les attributs au format long de chaque fond sont ensuite concaténés dans un seul fichier parquet pour être importés en une fois dans DuckDB.

### Normalisation des identifiants

Pour faciliter les jointures, une normalisation des identifiants est nécessaire. Par exemple, pour les noms de communes en France, il faut gérer les accents, les espaces, les apostrophes, les tirets, la casse, etc.
Voici une macro SQL pour DuckDB qui réalise cette normalisation :

```sql
CREATE OR REPLACE MACRO normalize_text(string) AS (
    SELECT nfc_normalize(string)
            .strip_accents().lower().trim()
            .regexp_replace('[^a-z0-9]+', ' ', 'g')
            .regexp_replace('\bste\.?\b', 'sainte', 'g')
            .regexp_replace('\bst\.?\b', 'saint', 'g')
);
```

Les étapes de la normalisation sont :

- `nfc_normalize` pour normaliser les caractères Unicode (ex: é en e + ´)
- `strip_accents` pour enlever les accents
- `lower` pour mettre en minuscules
- `trim` pour enlever les espaces en début et fin de chaîne
- `regexp_replace('[^a-z0-9]+', ' ', 'g')` pour remplacer les caractères non alphanumériques par des espaces simples
- `regexp_replace('\bste\.?\b', 'sainte', 'g')` pour remplacer les abréviations de Sainte
- `regexp_replace('\bst\.?\b', 'saint', 'g')` pour remplacer les abréviations de Saint

[Avec DuckDB, on peut entourer un string de $$](https://duckdb.org/docs/stable/sql/data_types/literal_types#dollar-quoted-string-literals) pour éviter d'avoir à échapper les apostrophes ou autres caractères spéciaux.

### Formatage des attributs

Passage d'un format large à un format long avec DuckDB :

```sql
CREATE OR REPLACE MACRO reshape_attributes(table_name, basemap_name, id_col) AS TABLE (
  WITH
    nb AS (
      FROM query_table(table_name) SELECT basemap_count: count(*)
    ),
    attr_with_id AS (
      FROM query_table(table_name)
      SELECT id: id_col, *
    ),
    attr_long AS (
      UNPIVOT attr_with_id
        ON COLUMNS(* EXCLUDE id)
        INTO
          NAME variant
          VALUE raw
    )
  FROM attr_long, nb
  SELECT
    raw,
    id,
    variant,
    normalized: normalize_text(raw),
    basemap: basemap_name,
    basemap_count
);
```

### Métadonnées d'un fond

Afin d'être listé et filtré correctement dans Khartis, chaque fond doit également inclure des métadonnées supplémentaires.

- file
- titre
- description
- source
- date
- bbox
- projection
- layers

```json
{
  "file": "france-commune-2025",
  "title": "France > communes",
  "description": "Fond de carte des communes françaises compatible COG 2025",
  "source": "IGN - ADMIN EXPRESS COG CARTOPLUS",
  "date": "2025",
  "bbox": [-5.52, 40.98, 10.7, 50.85],
  "projection": "Lambert-93",
  "layers": [
    {
      "title": "Chefs-lieux des communes",
      "type": "centroid",
      "file": "france-commune-centroids-2025"
    },
    {
      "title": "Limites des départements",
      "type": "limit",
      "file": "france-departement-limites-2025"
    },
    {
      "title": "Limites des régions",
      "type": "limit",
      "file": "france-region-limites-2025"
    }
  ]
}
```

> La bbox est utilisée comme filtre spatial en cas de données géographiques sous forme de points (ex: un csv avec des coordonnées de villes).

> La projection indique si le fond est pré-projeté ou non. Par exemple Lambert-93 pour la France.

> Le champ layers liste les couches d'habillage associées au fond. Chaque couche a un titre, un type (centroid ou limit) et le nom du fichier (sans extension) contenant la géométrie.

## Structure finale

```plaintext
basemaps/
├── all-basemaps-metadata.json
├── all-basemaps-attributes.parquet
└── geometry/
    ├── countries_50m.parquet
    ├── france_com_2025.parquet
    └── ...
```

- `all-basemaps-metadata.json` : métadonnées globales sur les fonds disponibles.
- `all-basemaps-attributes.parquet` : table concaténée des attributs de tous les fonds.
- `geometry/` : contient les fichiers GeoParquet pour chaque fond de carte (un fichier par fond).

## Lecture de la géométrie dans DeckGL

La librairie @geoarrow/deck.gl-layers de kyle Baron permet de lire directement un fichier parquet avec géométrie en geoarrow dans DeckGL.
https://github.com/geoarrow/deck.gl-layers?tab=readme-ov-file#parquet

```javascript
import { readParquet } from "parquet-wasm"
import { tableFromIPC } from "apache-arrow";
import { GeoArrowScatterplotLayer } from "@geoarrow/deck.gl-layers";

const resp = await fetch("url/to/file.parquet");
const arrayBuffer = await resp.arrayBuffer();
const wasmTable = readParquet(new Uint8Array(arrayBuffer));
const jsTable = tableFromIPC(wasmTable.intoIPCStream());
const deckLayer = new GeoArrowScatterplotLayer({
  id: "scatterplot",
  data: jsTable,
  /// Replace with the correct geometry column name
  getPosition: jsTable.getChild("geometry")!,
});
```

**ToDo**:

- où placer les couches d'habillages dans la structure des dossiers ?
- automatiser la concaténation des attributs et des métadonnées
- lister les fonds à préparer (monde, france, nuts...)
