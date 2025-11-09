# Basemaps - Fonds de Carte

> **Guide de gestion des fonds de carte pour Khartis v3**

## 📚 Vue d'Ensemble

Les basemaps (fonds de carte) dans Khartis v3 utilisent une architecture **géométrie/attributs séparés** pour :
- Fichiers légers et rendu rapide avec Deck.gl
- Jointures efficaces via DuckDB
- Support d'identifiants multiples
- Performance optimale

## 🗺️ Basemaps Disponibles

### Monde
- **world-countries-50m** - Natural Earth, ~200 pays (5.8 MB GeoJSON)

### Europe
- **nuts2-europe-2021** - NUTS 2 régions, 242 entités (636 KB GeoParquet)

### France (IGN ADMIN EXPRESS 2025)
| Basemap | Niveau | Entités | Taille | Layers |
|---------|--------|---------|--------|--------|
| `france-region-2025` | Régions | 18 | 262 KB | centroids, limites |
| `france-departement-2025` | Départements | 101 | 679 KB | centroids, limites |
| `france-commune-2025` | Communes | ~35,000 | 6.7 MB | centroids, limites |
| `france-canton-2025` | Cantons | ~4,000 | 2.4 MB | centroids, limites |

**Total** : 6 basemaps, 15 fichiers géométriques

## 🏗️ Architecture

### Structure des Fichiers

```
static/basemaps/
├── all-basemaps-metadata.json          # Catalogue (bbox, layers, metadata)
├── all-basemaps-attributes.parquet     # Table normalisée pour jointures
└── geometry/
    ├── [basemap-id].parquet            # Géométrie GeoArrow
    ├── [basemap-id]-centroids.parquet  # Points centraux (optionnel)
    └── [basemap-id]-limites.parquet    # Limites admin (optionnel)
```

### Formats

- **Géométrie** : GeoParquet avec encodage **GeoArrow** (pas WKB), compression ZSTD
- **Attributs** : Parquet normalisé (format long pour jointures DuckDB)
- **Métadonnées** : JSON (catalogue, bbox, projection, layers)

### Spécifications Techniques

| Propriété | Valeur | Notes |
|-----------|--------|-------|
| Format géométrie | GeoParquet | GeoArrow encoding obligatoire |
| Colonne géométrie | `geom` | Nom standardisé |
| Compression | ZSTD | Meilleur ratio compression/vitesse |
| Type géométrie | Multi* | `PROMOTE_TO_MULTI` pour uniformité |
| Projection | WGS84 (EPSG:4326) | Par défaut, sauf besoin spécifique |

## ➕ Ajouter un Nouveau Basemap

### 1. Conversion en GeoParquet

**Depuis Shapefile :**
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

**Depuis GeoJSON :**
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

**Options utiles :**
```bash
# Reprojection vers WGS84
-t_srs EPSG:4326

# Simplification (réduire taille)
-simplify 0.001

# Sélectionner colonnes spécifiques
-select "id,name,iso3"
```

### 2. Préparation des Attributs

**Structure de la table normalisée :**

| Colonne | Type | Description |
|---------|------|-------------|
| `raw` | TEXT | Nom original |
| `id` | TEXT | Identifiant unique (ISO, code) |
| `variant` | TEXT | Type de variant (name, iso3, code) |
| `normalized` | TEXT | Nom normalisé (minuscules, sans accents) |
| `basemap` | TEXT | ID du basemap |
| `basemap_count` | INTEGER | Nombre d'entités |

**Script DuckDB :**
```sql
-- Macro de normalisation
CREATE OR REPLACE MACRO normalize_text(s) AS
  regexp_replace(
    regexp_replace(
      lower(strip_accents(trim(s))),
      '[^a-z0-9]', ''
    ),
    '\s+', ''
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

-- Exporter
COPY basemap_attributes
TO 'static/basemaps/mon-basemap-attributes.parquet'
(FORMAT PARQUET, COMPRESSION ZSTD);
```

### 3. Métadonnées

**Template JSON :**
```json
{
  "file": "mon-basemap-id",
  "title": "Région > Niveau administratif",
  "description": "Description complète du fond de carte",
  "source": "Source (IGN, Natural Earth, etc.)",
  "date": "2025",
  "bbox": [minLon, minLat, maxLon, maxLat],
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

**Calculer la bbox :**
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

### 4. Intégration au Catalogue

1. **Ajouter les fichiers** dans `static/basemaps/geometry/`
2. **Mettre à jour** `all-basemaps-metadata.json`
3. **Concaténer attributs** dans `all-basemaps-attributes.parquet`
4. **Tester** : `yarn dev` → créer projet → vérifier jointure

## ✅ Checklist de Validation

### Fichiers
- [ ] Géométrie : `[id].parquet` (GeoArrow)
- [ ] Centroids : `[id]-centroids.parquet` (optionnel)
- [ ] Limites : `[id]-limites.parquet` (optionnel)

### Métadonnées
- [ ] Entrée dans `all-basemaps-metadata.json`
- [ ] Bounding box calculée
- [ ] Projection documentée
- [ ] Layers définis

### Attributs
- [ ] Table normalisée générée
- [ ] Concaténation avec attributs existants
- [ ] Variants multiples (name, iso, code)

### Technique
- [ ] Format : GeoParquet + GEOARROW
- [ ] Compression : ZSTD
- [ ] Colonne : `geom`
- [ ] Type : PROMOTE_TO_MULTI
- [ ] Taille : <10 MB (idéal)

### Tests
- [ ] Chargement dans interface
- [ ] Affichage sur carte
- [ ] Jointure avec données
- [ ] Suggestions automatiques
- [ ] Layers additionnels

## 🎨 Layers d'Habillage

### Centroids
Points centraux pour affichage de labels à petite échelle.

```bash
# Créer centroids avec DuckDB
duckdb :memory: << 'EOF'
INSTALL spatial; LOAD spatial;
COPY (
  SELECT
    id,
    name,
    ST_Centroid(geom) as geom
  FROM parquet_scan('basemap.parquet')
) TO 'basemap-centroids.parquet'
(FORMAT PARQUET, COMPRESSION ZSTD);
EOF
```

### Limites
Limites administratives supérieures pour contexte.

```bash
# Extraire limites départements
ogr2ogr \
  france-departement-limites-2025.parquet \
  DEPARTEMENT.shp \
  -select "INSEE_DEP,NOM" \
  -lco GEOMETRY_NAME=geom \
  -lco GEOMETRY_ENCODING=GEOARROW \
  -lco COMPRESSION=ZSTD \
  -nlt PROMOTE_TO_MULTI
```

## 🚀 Exemple Complet : NUTS2 Europe

```bash
# 1. Télécharger
wget https://ec.europa.eu/eurostat/cache/GISCO/distribution/v2/nuts/geojson/NUTS_RG_20M_2021_4326_LEVL_2.geojson

# 2. Convertir géométrie
ogr2ogr \
  static/basemaps/geometry/nuts2-europe-2021.parquet \
  NUTS_RG_20M_2021_4326_LEVL_2.geojson \
  -lco GEOMETRY_NAME=geom \
  -lco GEOMETRY_ENCODING=GEOARROW \
  -lco COMPRESSION=ZSTD \
  -nlt PROMOTE_TO_MULTI

# 3. Générer attributs
duckdb :memory: << 'EOF'
CREATE MACRO normalize_text(s) AS
  regexp_replace(lower(strip_accents(trim(s))), '[^a-z0-9]', '');

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

COPY attrs TO 'nuts2-attributes.parquet'
(FORMAT PARQUET, COMPRESSION ZSTD);
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

# 5. Ajouter métadonnées à all-basemaps-metadata.json
```

## 📈 Roadmap

### À Ajouter

**Europe (NUTS Eurostat) :**
- [ ] NUTS 0 - Pays
- [ ] NUTS 1 - Macro-régions
- [x] NUTS 2 - Régions ✅
- [ ] NUTS 3 - Sous-régions

**Monde :**
- [ ] Admin 1 (provinces/états)
- [ ] Villes majeures (>100k habitants)

**France :**
- [ ] EPCI (Intercommunalités)
- [ ] Arrondissements
- [ ] Anciennes régions (pré-2016)

### Améliorations
- [ ] Convertir `world-countries-50m.geojson` en Parquet (~90% compression)
- [ ] Scripts de génération automatisés
- [ ] Tests de validation automatiques

## 🔧 Dépannage

### Basemap ne s'affiche pas
1. Vérifier fichier existe dans `static/basemaps/geometry/`
2. Vérifier métadonnées dans `all-basemaps-metadata.json`
3. Console navigateur pour erreurs
4. Colonne géométrie = `geom`

### Jointure échoue
1. Vérifier attributs dans `all-basemaps-attributes.parquet`
2. Normalisation correcte (minuscules, sans accents)
3. Tester requête DuckDB manuellement
4. `basemap` ID correspond au `file` des métadonnées

### Fichier trop volumineux
1. Simplifier géométrie : `-simplify 0.001`
2. Vérifier compression ZSTD
3. Résolution plus basse (20M au lieu de 10M)
4. Supprimer colonnes inutiles : `-select`

## 🔗 Ressources

### Sources de Données
- **Natural Earth** : https://www.naturalearthdata.com/
- **Eurostat GISCO** : https://ec.europa.eu/eurostat/web/gisco/geodata
- **IGN France** : https://geoservices.ign.fr/adminexpress
- **OpenStreetMap** : https://download.geofabrik.de/

### Documentation Technique
- **GeoParquet Spec** : https://geoparquet.org/
- **GeoArrow Spec** : https://geoarrow.org/
- **GDAL/OGR** : https://gdal.org/programs/ogr2ogr.html
- **DuckDB Spatial** : https://duckdb.org/docs/extensions/spatial
- **Deck.gl GeoArrow** : https://github.com/geoarrow/deck.gl-layers

## 🛠️ Prérequis

```bash
# GDAL/OGR (conversion formats)
brew install gdal              # macOS
sudo apt-get install gdal-bin  # Ubuntu/Debian

# DuckDB CLI (traitement attributs)
brew install duckdb            # macOS

# Vérification
ogr2ogr --version   # GDAL 3.x+
duckdb --version    # DuckDB 1.0.0+
```

---

**Voir aussi :**
- [Documentation détaillée basemaps](basemaps/) - Guides complets et exemples
- [DATA_PIPELINE.md](DATA_PIPELINE.md) - Intégration données utilisateur
- [VISUALIZATION.md](VISUALIZATION.md) - Rendu des basemaps

**Documentation Version** : 3.1.0
**Last Updated** : 2025-01-09
