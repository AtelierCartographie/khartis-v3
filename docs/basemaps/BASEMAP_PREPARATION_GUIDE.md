# Guide de préparation des fonds de carte (Basemaps)

Ce document décrit le processus complet de préparation et d'ajout de nouveaux fonds de carte dans Khartis v3.

## 📋 Table des matières

1. [Prérequis](#prérequis)
2. [Architecture des basemaps](#architecture-des-basemaps)
3. [Conversion en GeoParquet](#conversion-en-geoparquet)
4. [Préparation des attributs](#préparation-des-attributs)
5. [Création des métadonnées](#création-des-métadonnées)
6. [Ajout au catalogue](#ajout-au-catalogue)
7. [Checklist finale](#checklist-finale)

---

## Prérequis

### Logiciels nécessaires

```bash
# GDAL/OGR (pour conversion de formats géographiques)
brew install gdal              # macOS
sudo apt-get install gdal-bin  # Ubuntu/Debian

# DuckDB CLI (pour traitement des attributs)
brew install duckdb            # macOS
# ou télécharger depuis https://duckdb.org/docs/installation/

# Node.js et Yarn (pour scripts de génération)
brew install node yarn         # macOS
```

### Vérification de l'installation

```bash
ogr2ogr --version   # GDAL 3.x ou supérieur
duckdb --version    # DuckDB 1.0.0 ou supérieur
node --version      # Node 18.x ou supérieur
```

---

## Architecture des basemaps

```
static/basemaps/
├── all-basemaps-metadata.json          # Catalogue de tous les fonds
├── all-basemaps-attributes.parquet     # Table normalisée des noms
└── geometry/
    ├── [basemap-id].parquet            # Géométrie principale (GeoArrow)
    ├── [basemap-id]-centroids.parquet  # Points centraux (optionnel)
    └── [basemap-id]-limites.parquet    # Limites admin sup. (optionnel)
```

### Spécifications techniques

- **Format géométrie** : GeoParquet avec encodage **GeoArrow** (pas WKB)
- **Nom de colonne** : `geom` (obligatoire)
- **Compression** : ZSTD
- **Projection** : WGS84 (EPSG:4326) ou locale documentée
- **Type géométrie** : PROMOTE_TO_MULTI (tous en Multi\*)

---

## Conversion en GeoParquet

### Depuis Shapefile

```bash
ogr2ogr \
  static/basemaps/geometry/mon-fond.parquet \
  source-data/mon-fond.shp \
  -lco GEOMETRY_NAME=geom \
  -lco GEOMETRY_ENCODING=GEOARROW \
  -lco COMPRESSION=ZSTD \
  -lco WRITE_COVERING_BBOX=NO \
  -nlt PROMOTE_TO_MULTI
```

### Depuis GeoJSON

```bash
ogr2ogr \
  static/basemaps/geometry/mon-fond.parquet \
  source-data/mon-fond.geojson \
  -lco GEOMETRY_NAME=geom \
  -lco GEOMETRY_ENCODING=GEOARROW \
  -lco COMPRESSION=ZSTD \
  -lco WRITE_COVERING_BBOX=NO \
  -nlt PROMOTE_TO_MULTI
```

### Depuis GeoPackage

```bash
ogr2ogr \
  static/basemaps/geometry/mon-fond.parquet \
  source-data/mon-fond.gpkg \
  -lco GEOMETRY_NAME=geom \
  -lco GEOMETRY_ENCODING=GEOARROW \
  -lco COMPRESSION=ZSTD \
  -lco WRITE_COVERING_BBOX=NO \
  -nlt PROMOTE_TO_MULTI \
  -sql "SELECT * FROM ma_couche"
```

### Options avancées

```bash
# Sélectionner uniquement certaines colonnes
ogr2ogr \
  output.parquet input.shp \
  -select "id,name,iso3" \
  -lco GEOMETRY_NAME=geom \
  -lco GEOMETRY_ENCODING=GEOARROW \
  -lco COMPRESSION=ZSTD \
  -nlt PROMOTE_TO_MULTI

# Reprojection vers WGS84
ogr2ogr \
  output.parquet input.shp \
  -t_srs EPSG:4326 \
  -lco GEOMETRY_NAME=geom \
  -lco GEOMETRY_ENCODING=GEOARROW \
  -lco COMPRESSION=ZSTD \
  -nlt PROMOTE_TO_MULTI

# Simplification de géométrie (pour réduire la taille)
ogr2ogr \
  output.parquet input.shp \
  -simplify 0.001 \
  -lco GEOMETRY_NAME=geom \
  -lco GEOMETRY_ENCODING=GEOARROW \
  -lco COMPRESSION=ZSTD \
  -nlt PROMOTE_TO_MULTI
```

---

## Préparation des attributs

Les attributs normalisés permettent la jointure entre données utilisateur et fond de carte.

### Structure de la table

| Colonne         | Type    | Description                                     |
| --------------- | ------- | ----------------------------------------------- |
| `raw`           | TEXT    | Nom original tel qu'écrit                       |
| `id`            | TEXT    | Identifiant unique (ISO, code, etc.)            |
| `variant`       | TEXT    | Type de variant (name, iso3, code_postal, etc.) |
| `normalized`    | TEXT    | Nom normalisé (minuscules, sans accents)        |
| `basemap`       | TEXT    | ID du basemap                                   |
| `basemap_count` | INTEGER | Nombre d'entités dans le basemap                |

### Script DuckDB pour normalisation

```sql
-- Macro de normalisation
CREATE OR REPLACE MACRO normalize_text(s) AS
  regexp_replace(
    regexp_replace(
      lower(
        strip_accents(
          trim(s)
        )
      ),
      '[^a-z0-9]',
      ''
    ),
    '\s+',
    ''
  );

-- Créer table normalisée
CREATE TABLE basemap_attributes AS
SELECT DISTINCT
  name as raw,
  id,
  'name' as variant,
  normalize_text(name) as normalized,
  'mon-basemap-id' as basemap,
  count(*) OVER () as basemap_count
FROM parquet_scan('static/basemaps/geometry/mon-fond.parquet')

UNION ALL

SELECT DISTINCT
  iso3 as raw,
  id,
  'iso3' as variant,
  normalize_text(iso3) as normalized,
  'mon-basemap-id' as basemap,
  count(*) OVER () as basemap_count
FROM parquet_scan('static/basemaps/geometry/mon-fond.parquet')
WHERE iso3 IS NOT NULL;

-- Exporter en Parquet
COPY basemap_attributes
TO 'static/basemaps/mon-basemap-attributes.parquet'
(FORMAT PARQUET, COMPRESSION ZSTD);
```

### Concaténation avec attributs existants

```sql
-- Charger attributs existants
CREATE TABLE existing_attrs AS
FROM parquet_scan('static/basemaps/all-basemaps-attributes.parquet');

-- Charger nouveaux attributs
CREATE TABLE new_attrs AS
FROM parquet_scan('static/basemaps/mon-basemap-attributes.parquet');

-- Fusionner
CREATE TABLE all_attrs AS
SELECT * FROM existing_attrs
UNION ALL
SELECT * FROM new_attrs;

-- Exporter
COPY all_attrs
TO 'static/basemaps/all-basemaps-attributes.parquet'
(FORMAT PARQUET, COMPRESSION ZSTD);
```

---

## Création des métadonnées

### Template de métadonnées

```json
{
  "file": "mon-basemap-id",
  "title": "Région > Niveau administratif",
  "description": "Description complète du fond de carte",
  "source": "Source des données (IGN, Natural Earth, etc.)",
  "date": "2025",
  "bbox": [-5.52, 40.98, 10.7, 50.85],
  "projection": "WGS84",
  "layers": [
    {
      "title": "Centroids des entités",
      "type": "centroid",
      "file": "mon-basemap-id-centroids"
    },
    {
      "title": "Limites administratives",
      "type": "limit",
      "file": "mon-basemap-id-limites"
    }
  ]
}
```

### Calcul de la bounding box

```bash
# Avec GDAL
ogrinfo -al -so source.shp | grep Extent

# Avec DuckDB
duckdb :memory: "
  SELECT
    ST_XMin(ST_Envelope_Agg(geom)) as min_lon,
    ST_YMin(ST_Envelope_Agg(geom)) as min_lat,
    ST_XMax(ST_Envelope_Agg(geom)) as max_lon,
    ST_YMax(ST_Envelope_Agg(geom)) as max_lat
  FROM parquet_scan('mon-fond.parquet')
"
```

---

## Ajout au catalogue

### 1. Ajouter les fichiers

```
static/basemaps/geometry/
├── mon-basemap-id.parquet           ✅ Nouveau
├── mon-basemap-id-centroids.parquet ✅ Nouveau (optionnel)
└── mon-basemap-id-limites.parquet   ✅ Nouveau (optionnel)
```

### 2. Mettre à jour `all-basemaps-metadata.json`

Ajouter l'objet JSON au tableau principal :

```json
[
  // ... basemaps existants ...
  {
    "file": "mon-basemap-id",
    "title": "Mon nouveau fond",
    "description": "...",
    "source": "...",
    "date": "2025",
    "bbox": [...],
    "projection": "WGS84",
    "layers": [...]
  }
]
```

### 3. Régénérer les attributs consolidés

Exécuter le script SQL de concaténation (voir section Préparation des attributs).

### 4. Tester l'intégration

```bash
# Démarrer le serveur de dev
yarn dev

# Ouvrir http://localhost:5176
# Créer un nouveau projet
# Importer des données correspondant au basemap
# Vérifier que le basemap apparaît dans les suggestions
# Tester la jointure
```

---

## Checklist finale

### ✅ Fichiers créés

- [ ] `static/basemaps/geometry/[id].parquet` (géométrie GeoArrow)
- [ ] `static/basemaps/geometry/[id]-centroids.parquet` (si applicable)
- [ ] `static/basemaps/geometry/[id]-limites.parquet` (si applicable)

### ✅ Métadonnées

- [ ] Entrée ajoutée dans `all-basemaps-metadata.json`
- [ ] Bounding box calculée et validée
- [ ] Projection documentée
- [ ] Layers définis (centroid/limit)

### ✅ Attributs

- [ ] Table normalisée générée
- [ ] Concaténation avec `all-basemaps-attributes.parquet`
- [ ] Variants multiples (name, iso, code, etc.)

### ✅ Validation technique

- [ ] Format : GeoParquet avec GEOARROW encoding
- [ ] Compression : ZSTD
- [ ] Colonne géométrie : `geom`
- [ ] Type géométrie : PROMOTE_TO_MULTI
- [ ] Taille fichier optimisée (< 10 MB si possible)

### ✅ Tests fonctionnels

- [ ] Chargement dans l'interface
- [ ] Affichage sur la carte
- [ ] Jointure avec données utilisateur
- [ ] Suggestions automatiques
- [ ] Layers additionnels (centroids/limites)

---

## Exemples complets

### Exemple 1 : Régions NUTS2 Europe

```bash
# 1. Télécharger les données
wget https://ec.europa.eu/eurostat/cache/GISCO/distribution/v2/nuts/geojson/NUTS_RG_20M_2021_4326_LEVL_2.geojson

# 2. Convertir en GeoParquet
ogr2ogr \
  static/basemaps/geometry/nuts2-europe-2021.parquet \
  NUTS_RG_20M_2021_4326_LEVL_2.geojson \
  -lco GEOMETRY_NAME=geom \
  -lco GEOMETRY_ENCODING=GEOARROW \
  -lco COMPRESSION=ZSTD \
  -lco WRITE_COVERING_BBOX=NO \
  -nlt PROMOTE_TO_MULTI

# 3. Générer attributs normalisés
duckdb :memory: << 'EOF'
CREATE OR REPLACE MACRO normalize_text(s) AS
  regexp_replace(
    regexp_replace(lower(strip_accents(trim(s))), '[^a-z0-9]', ''),
    '\s+', ''
  );

CREATE TABLE attrs AS
SELECT DISTINCT
  NUTS_NAME as raw,
  NUTS_ID as id,
  'name' as variant,
  normalize_text(NUTS_NAME) as normalized,
  'nuts2-europe-2021' as basemap,
  count(*) OVER () as basemap_count
FROM parquet_scan('static/basemaps/geometry/nuts2-europe-2021.parquet')
UNION ALL
SELECT DISTINCT
  NUTS_ID as raw,
  NUTS_ID as id,
  'nuts_code' as variant,
  normalize_text(NUTS_ID) as normalized,
  'nuts2-europe-2021' as basemap,
  count(*) OVER () as basemap_count
FROM parquet_scan('static/basemaps/geometry/nuts2-europe-2021.parquet');

COPY attrs TO 'nuts2-attributes.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
EOF

# 4. Calculer bbox
duckdb :memory: "
  INSTALL spatial; LOAD spatial;
  SELECT
    ST_XMin(ST_Envelope_Agg(geom)) as min_lon,
    ST_YMin(ST_Envelope_Agg(geom)) as min_lat,
    ST_XMax(ST_Envelope_Agg(geom)) as max_lon,
    ST_YMax(ST_Envelope_Agg(geom)) as max_lat
  FROM parquet_scan('static/basemaps/geometry/nuts2-europe-2021.parquet')
"
```

### Exemple 2 : Départements français avec centroids

```bash
# 1. Convertir géométries principales
ogr2ogr \
  static/basemaps/geometry/france-departement-2025.parquet \
  ADMIN-EXPRESS-COG_2025/DEPARTEMENT.shp \
  -lco GEOMETRY_NAME=geom \
  -lco GEOMETRY_ENCODING=GEOARROW \
  -lco COMPRESSION=ZSTD \
  -nlt PROMOTE_TO_MULTI

# 2. Créer les centroids
duckdb :memory: << 'EOF'
INSTALL spatial; LOAD spatial;
COPY (
  SELECT
    INSEE_DEP as id,
    NOM as name,
    ST_Centroid(geom) as geom
  FROM parquet_scan('static/basemaps/geometry/france-departement-2025.parquet')
) TO 'static/basemaps/geometry/france-departement-centroids-2025.parquet'
(FORMAT PARQUET, COMPRESSION ZSTD);
EOF
```

---

## Ressources utiles

### Sources de données géographiques ouvertes

- **Natural Earth** : https://www.naturalearthdata.com/
- **GISCO (Eurostat)** : https://ec.europa.eu/eurostat/web/gisco/geodata
- **IGN France** : https://geoservices.ign.fr/adminexpress
- **OpenStreetMap** : https://download.geofabrik.de/

### Documentation technique

- **GeoParquet Spec** : https://geoparquet.org/
- **GeoArrow Spec** : https://geoarrow.org/
- **GDAL/OGR** : https://gdal.org/programs/ogr2ogr.html
- **DuckDB Spatial** : https://duckdb.org/docs/extensions/spatial

---

## Support

Pour toute question ou problème :

1. Consulter [00-basemap-khartis-101.md](../../static/basemaps/00-basemap-khartis-101.md)
2. Vérifier les exemples existants dans `static/basemaps/`
3. Ouvrir un issue GitHub avec le tag `basemap`
