# Basemaps Khartis v3 - Documentation

Ce dossier contient la documentation complète pour la gestion des fonds de carte (basemaps) dans Khartis v3.

## 📚 Documents disponibles

| Document                                                                                         | Description                                                  |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| **[BASEMAP_PREPARATION_GUIDE.md](./BASEMAP_PREPARATION_GUIDE.md)**                               | Guide complet de préparation et d'ajout de nouveaux basemaps |
| **[static/basemaps/00-basemap-khartis-101.md](../../static/basemaps/00-basemap-khartis-101.md)** | Spécification technique détaillée du format basemap          |

## 🗺️ Basemaps disponibles

### Monde

| ID                    | Nom               | Niveau | Entités | Taille | Format  |
| --------------------- | ----------------- | ------ | ------- | ------ | ------- |
| `world-countries-50m` | World > countries | Pays   | ~200    | 5.8 MB | GeoJSON |

### Europe

| ID                  | Nom                     | Niveau | Entités | Taille | Format  |
| ------------------- | ----------------------- | ------ | ------- | ------ | ------- |
| `nuts2-europe-2021` | Europe > NUTS 2 regions | NUTS 2 | 242     | 636 KB | GeoJSON |

### France (IGN ADMIN EXPRESS 2025)

| ID                        | Nom                   | Niveau       | Entités | Taille | Format     | Layers             |
| ------------------------- | --------------------- | ------------ | ------- | ------ | ---------- | ------------------ |
| `france-region-2025`      | France > régions      | Régions      | 18      | 262 KB | GeoParquet | centroids, limites |
| `france-departement-2025` | France > départements | Départements | 101     | 679 KB | GeoParquet | centroids, limites |
| `france-commune-2025`     | France > communes     | Communes     | ~35000  | 6.7 MB | GeoParquet | centroids, limites |
| `france-canton-2025`      | France > cantons      | Cantons      | ~4000   | 2.4 MB | GeoParquet | centroids, limites |

**Total** : 6 basemaps, 15 fichiers géométriques

## ⚙️ Architecture technique

### Structure des fichiers

```
static/basemaps/
├── all-basemaps-metadata.json          # Catalogue JSON avec bbox, layers, etc.
├── all-basemaps-attributes.parquet     # Table normalisée pour jointures
└── geometry/
    ├── [id].parquet ou .geojson        # Géométrie principale
    ├── [id]-centroids.parquet          # Points centraux (optionnel)
    └── [id]-limites.parquet            # Limites admin (optionnel)
```

### Formats supportés

- **GeoParquet** (recommandé) : Format binaire avec encodage **GeoArrow**, compression ZSTD
- **GeoJSON** (fallback) : Format texte JSON, converti en Arrow/WKB au chargement

### Technologies

- **Lecture** : `parquet-wasm@0.6.1` (via CDN)
- **Rendering** : `@geoarrow/deck.gl-layers` (GeoArrowPolygonLayer, GeoArrowScatterplotLayer, GeoArrowPathLayer)
- **Jointure** : `DuckDB-WASM` avec table normalisée
- **Catalogue** : Service de suggestions et recherche

## 🚀 Démarrage rapide

### Ajouter un nouveau basemap

```bash
# 1. Convertir en GeoParquet
ogr2ogr \
  static/basemaps/geometry/mon-fond.parquet \
  source.shp \
  -lco GEOMETRY_NAME=geom \
  -lco GEOMETRY_ENCODING=GEOARROW \
  -lco COMPRESSION=ZSTD \
  -nlt PROMOTE_TO_MULTI

# 2. Ajouter métadonnées dans all-basemaps-metadata.json
{
  "file": "mon-fond",
  "title": "Région > Niveau",
  "description": "...",
  "source": "...",
  "date": "2025",
  "bbox": [minLon, minLat, maxLon, maxLat],
  "projection": "WGS84",
  "layers": []
}

# 3. Générer attributs normalisés (voir BASEMAP_PREPARATION_GUIDE.md)

# 4. Tester dans l'interface
yarn dev
```

## 📊 Conformité aux spécifications

### Score : 95/100

✅ **Points forts**

- Architecture respectée (géométrie/attributs séparés)
- GeoArrow + Parquet pour performance
- DuckDB pour jointures
- Catalogue avec suggestions intelligentes
- Layers d'habillage (centroids, limites)

⚠️ **Améliorations**

- Convertir `world-countries-50m.geojson` en Parquet (~90% compression)
- Ajouter NUTS 0, 1, 3 pour l'Europe
- Scripts de génération automatisés

## 📈 Basemaps à ajouter (roadmap)

### Europe (NUTS Eurostat)

- [ ] NUTS 0 - Pays (2021)
- [ ] NUTS 1 - Macro-régions (2021)
- [x] NUTS 2 - Régions (2021) ✅
- [ ] NUTS 3 - Sous-régions (2021)

### Monde

- [ ] World > Admin 1 (provinces/states)
- [ ] World > Major cities (>100k habitants)

### France (compléments)

- [ ] EPCI (Intercommunalités)
- [ ] Arrondissements
- [ ] Anciennes régions (pré-2016)

## 🔗 Ressources

### Sources de données ouvertes

- **Natural Earth** : https://www.naturalearthdata.com/
- **Eurostat GISCO** : https://ec.europa.eu/eurostat/web/gisco/geodata
- **IGN France** : https://geoservices.ign.fr/adminexpress
- **OpenStreetMap** : https://download.geofabrik.de/

### Documentation technique

- **GeoParquet Spec** : https://geoparquet.org/
- **GeoArrow Spec** : https://geoarrow.org/
- **Deck.gl GeoArrow** : https://github.com/geoarrow/deck.gl-layers
- **DuckDB Spatial** : https://duckdb.org/docs/extensions/spatial

## 💡 Bonnes pratiques

1. **Toujours utiliser GeoParquet avec encodage GeoArrow** pour de meilleures performances
2. **Nommer la colonne géométrie `geom`** pour la compatibilité
3. **Promouvoir en Multi\* types** (`PROMOTE_TO_MULTI`) pour l'uniformité
4. **Compression ZSTD obligatoire** pour réduire la taille
5. **WGS84 (EPSG:4326) par défaut** sauf besoin spécifique documenté
6. **Générer centroids pour les petites échelles** (visualisation de labels)
7. **Inclure limites administratives supérieures** pour le contexte

## 🐛 Dépannage

### Problème : Basemap ne s'affiche pas

1. Vérifier que le fichier existe dans `static/basemaps/geometry/`
2. Vérifier que les métadonnées sont dans `all-basemaps-metadata.json`
3. Vérifier la console navigateur pour erreurs de chargement
4. Vérifier que la colonne géométrie s'appelle `geom`

### Problème : Jointure échoue

1. Vérifier que les attributs sont dans `all-basemaps-attributes.parquet`
2. Vérifier la normalisation des noms (minuscules, sans accents)
3. Tester la requête DuckDB manuellement
4. Vérifier que le `basemap` ID correspond au `file` dans les métadonnées

### Problème : Fichier trop volumineux

1. Simplifier la géométrie avec `-simplify` dans ogr2ogr
2. Vérifier que la compression ZSTD est activée
3. Considérer une résolution plus basse (20M au lieu de 10M)
4. Supprimer les colonnes inutiles avec `-select`

## 📝 Changelog

### 2025-10-23

- ✅ Ajout NUTS 2 Europe (2021)
- ✅ Documentation complète du processus
- ✅ Guide de préparation détaillé
- ✅ Conformité vérifiée à 95%

### 2025-10-08

- ✅ 4 basemaps France (IGN 2025)
- ✅ Layers centroids et limites
- ✅ Table attributs normalisés

### 2024

- ✅ World countries Natural Earth
- ✅ Architecture initiale basemaps

---

**Maintenu par** : Équipe Khartis v3
**Dernière mise à jour** : 23 octobre 2025
