# PWA Configuration Guide

This document explains how the Progressive Web App (PWA) is configured in Khartis v3 for optimal SvelteKit SPA integration.

## Overview

Khartis v3 uses `vite-plugin-pwa` to provide offline-first capabilities, allowing users to:

- Install the app on their device
- Access the app offline after first visit
- Cache large static assets (basemaps, DuckDB extensions)
- Get automatic updates with user prompts

## Technology Stack

| Component             | Package                    | Version               | Purpose                              |
| --------------------- | -------------------------- | --------------------- | ------------------------------------ |
| **PWA Plugin**        | `vite-plugin-pwa`          | ^1.1.0                | Service worker generation & manifest |
| **SvelteKit Adapter** | `@sveltejs/adapter-static` | ^3.0.10               | Static site generation (SPA mode)    |
| **Service Worker**    | Workbox                    | (via vite-plugin-pwa) | Asset caching & offline support      |

## Configuration Files

### 1. SvelteKit Configuration ([svelte.config.js](../svelte.config.js))

```javascript
import adapter from '@sveltejs/adapter-static';

const config = {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html', // ← SPA mode: all routes → index.html
      precompress: false,
      strict: true
    }),
    paths: {
      base:
        process.env.NODE_ENV === 'production'
          ? '/cartographie/khartisnewpprd'
          : ''
    }
  }
};
```

**Key setting**: `fallback: 'index.html'` enables SPA mode where all routes are handled client-side.

### 2. Vite PWA Configuration ([vite.config.ts](../vite.config.ts#L14-L97))

```typescript
VitePWA({
  registerType: 'prompt', // Show update prompt to user

  devOptions: {
    enabled: true, // Enable PWA in development
    type: 'module',
    navigateFallback: '/' // Fallback route for dev server
  },

  includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],

  workbox: {
    // Workbox configuration (see below)
  },

  manifest: {
    // Web App Manifest (see below)
  }
});
```

## Workbox Configuration

### Cache Patterns

```typescript
workbox: {
  sourcemap: false,
  cleanupOutdatedCaches: true,

  // What to cache
  globPatterns: [
    '**/*.{js,css,woff2,woff,ttf,eot,otf,splinecode}'
  ],

  // What NOT to cache
  globIgnores: [
    '**/node_modules/**/*'
  ],

  // SPA fallback configuration
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [
    /^\/api\//,      // Don't fallback for API routes
    /\.[^/?]+$/      // Don't fallback for files with extensions
  ],

  maximumFileSizeToCacheInBytes: 1147483648  // 1GB (for large basemaps)
}
```

### Runtime Caching Strategies

Khartis uses **CacheFirst** strategy for external resources that change infrequently:

#### 1. DuckDB Extensions

```typescript
{
  urlPattern: /^https:\/\/extensions\.duckdb\.org\/.*/,
  handler: 'CacheFirst',
  options: {
    cacheName: 'duckdb-extensions',
    expiration: {
      maxEntries: 10,
      maxAgeSeconds: 60 * 60 * 24 * 30  // 30 days
    },
    cacheableResponse: {
      statuses: [0, 200]
    }
  }
}
```

**Why CacheFirst?** DuckDB extensions are version-pinned and rarely change. Serving from cache is faster and works offline.

#### 2. Basemaps (GeoParquet files)

```typescript
{
  urlPattern: /\/basemaps\/.*\.(parquet|geojson|json)$/,
  handler: 'CacheFirst',
  options: {
    cacheName: 'basemaps-data',
    expiration: {
      maxEntries: 100,
      maxAgeSeconds: 60 * 60 * 24 * 365  // 1 year
    },
    cacheableResponse: {
      statuses: [0, 200]
    }
  }
}
```

**Why CacheFirst?** Basemaps are static GeoParquet files (World countries, France regions, etc.) that never change. Long cache duration enables true offline mapping.

**Files cached**: ~25MB total

- `all-basemaps-metadata.json` (10KB)
- `all-basemaps-attributes.parquet` (684KB)
- Geometry files: 14 parquet + 2 geojson files (~24MB)

#### 3. WASM Files and Workers

```typescript
{
  urlPattern: /.*\.(wasm|worker\.js)$/,
  handler: 'CacheFirst',
  options: {
    cacheName: 'wasm-workers',
    expiration: {
      maxEntries: 20,
      maxAgeSeconds: 60 * 60 * 24 * 90  // 90 days
    },
    cacheableResponse: {
      statuses: [0, 200]
    }
  }
}
```

**Why CacheFirst?** WASM files are build artifacts (hashed filenames) that never change. Critical for offline functionality.

**Files cached**: ~81MB total (loaded on-demand)

- `duckdb-mvp.wasm` (36MB) - DuckDB WASM MVP bundle
- `duckdb-eh.wasm` (31MB) - DuckDB Exception Handling bundle
- `index_bg.wasm` (7MB) - GeoParquet WASM
- `parquet_wasm_bg.wasm` (6.3MB) - Parquet reader
- `sql-wasm.wasm` (644KB) - SQL.js WASM
- Worker files (2 files, ~100KB each)

**Optimization**: WASM files are **excluded from precaching** and loaded via runtime caching only. This reduces initial cache size from ~85MB to ~4MB.

#### 4. Map Tiles (OSM, Carto, OpenFreeMap)

```typescript
// OpenStreetMap Tiles
{
  urlPattern: /^https:\/\/(tile\.openstreetmap\.org|tile-[abc]\.openstreetmap\.fr|tile\.thunderforest\.com)\/.*/,
  handler: 'CacheFirst',
  options: {
    cacheName: 'osm-tiles',
    expiration: {
      maxEntries: 500,
      maxAgeSeconds: 60 * 60 * 24 * 90  // 90 days
    },
    cacheableResponse: {
      statuses: [0, 200]
    }
  }
},

// Carto Basemap Tiles
{
  urlPattern: /^https:\/\/basemaps\.cartocdn\.com\/.*/,
  handler: 'CacheFirst',
  options: {
    cacheName: 'carto-tiles',
    expiration: {
      maxEntries: 500,
      maxAgeSeconds: 60 * 60 * 24 * 90  // 90 days
    },
    cacheableResponse: {
      statuses: [0, 200]
    }
  }
},

// OpenFreeMap Tiles
{
  urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/,
  handler: 'CacheFirst',
  options: {
    cacheName: 'openfreemap-tiles',
    expiration: {
      maxEntries: 500,
      maxAgeSeconds: 60 * 60 * 24 * 90  // 90 days
    },
    cacheableResponse: {
      statuses: [0, 200]
    }
  }
}
```

**Why CacheFirst?** Map tiles are immutable (identified by z/x/y coordinates). Long cache duration enables offline map viewing.

**Estimated size**: 10-50MB (depends on zoom levels and areas viewed)

- Each tile: ~10-50KB
- 500 tiles max per provider = ~25MB max per cache

## Web App Manifest

The manifest defines how Khartis appears when installed as a PWA:

```typescript
manifest: {
  name: 'Khartis',
  short_name: 'KH',
  display: 'standalone',           // Hide browser UI
  theme_color: '#ffffff',
  background_color: '#ffffff',
  orientation: 'portrait',

  start_url: '/cartographie/khartisnewpprd/?standalone=true',
  scope: '/cartographie/khartisnewpprd/',

  description: 'Khartis est un outil simple de créations de cartes thématiques...',

  icons: [
    { src: '/cartographie/khartisnewpprd/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
    { src: '/cartographie/khartisnewpprd/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: '/cartographie/khartisnewpprd/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/cartographie/khartisnewpprd/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
}
```

### Icon Requirements

| Size                 | Purpose                  | Notes                 |
| -------------------- | ------------------------ | --------------------- |
| **64x64**            | Favicon, small devices   | PNG format            |
| **192x192**          | Android home screen      | PNG format            |
| **512x512**          | Splash screen, app store | `purpose: 'any'`      |
| **512x512 maskable** | Adaptive icons (Android) | `purpose: 'maskable'` |

**Generating icons**: Use `@vite-pwa/assets-generator`:

```bash
yarn generate-pwa-assets
```

## Update Prompt Component

The app includes a user-friendly update prompt ([pwa-update-prompt.svelte](../src/lib/features/commons/components/pwa-update-prompt.svelte)):

```typescript
import { useRegisterSW } from 'virtual:pwa-register/svelte';

const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
  onRegistered(registration) {
    if (registration) {
      // Check for updates every hour
      setInterval(
        () => {
          registration.update();
        },
        60 * 60 * 1000
      );
    }
  }
});

function handleUpdate() {
  updateServiceWorker(true); // Reload with new version
}
```

**User Experience**:

1. User loads app → Service worker checks for updates
2. If update found → Show inline notification: "New version available"
3. User clicks "Update" → App reloads with new version
4. All cached data persists (IndexedDB projects remain intact)

## Offline Capabilities

### What Works Offline

✅ **Full app functionality** after first visit
✅ **All cached basemaps** (World, France regions, etc.)
✅ **DuckDB WASM** (data processing engine)
✅ **User projects** (stored in IndexedDB)
✅ **Previously imported datasets** (cached as GeoParquet)

### What Requires Network

❌ **New basemap downloads** (first time only)
❌ **DuckDB extension downloads** (first time only)
❌ **External API calls** (if any)

## Troubleshooting

### Issue: "bad-precaching-response" errors

**Symptom**: Console shows `Uncaught (in promise) bad-precaching-response`

**Cause**: Workbox trying to precache files that don't exist or are generated dynamically

**Solution**: Ensure `navigateFallback` is set correctly and virtual files are excluded:

```typescript
workbox: {
  navigateFallback: '/index.html',           // ✅ Correct for SPA
  navigateFallbackDenylist: [/^\/api\//, /\.[^/?]+$/],  // ✅ Exclude API & files
  globIgnores: ['**/node_modules/**/*']      // ✅ Exclude dependencies
}
```

### Issue: App doesn't update after deploying new version

**Symptom**: Users still see old version even after deployment

**Cause**: Service worker aggressively caching assets

**Solution**:

1. Ensure `registerType: 'prompt'` is set (shows update notification)
2. Increment version in `package.json` before build
3. User must click "Update" in the notification

**Force update** (development only):

```javascript
// In browser console
navigator.serviceWorker.getRegistrations().then((registrations) => {
  registrations.forEach((r) => r.unregister());
});
location.reload();
```

### Issue: Large files (basemaps) not caching

**Symptom**: Warning about file size limit

**Solution**: Increase `maximumFileSizeToCacheInBytes`:

```typescript
workbox: {
  maximumFileSizeToCacheInBytes: 1147483648; // 1GB (current setting)
}
```

**Warning**: Setting this too high may cause storage quota issues on mobile devices.

### Issue: Development server not serving service worker

**Symptom**: PWA features don't work in dev mode

**Solution**: Ensure `devOptions.enabled: true`:

```typescript
devOptions: {
  enabled: true,  // ✅ Enable PWA in development
  type: 'module',
  navigateFallback: '/'
}
```

### Issue: "GeoArrow extension metadata missing" warnings

**Symptom**: Console shows warnings about GeoArrow metadata mismatches

```
⚠️ GeoArrow extension metadata missing or mismatched, falling back to manual accessor
```

**Cause**: GeoParquet files generated with ogr2ogr don't include full GeoArrow extension metadata

**Impact**: ⚠️ **Non-critical** - App automatically falls back to manual geometry accessor. No functionality lost.

**Solution**: This is expected behavior. The warning can be safely ignored or suppressed:

```typescript
// In map rendering code (optional - not required)
if (process.env.NODE_ENV === 'development') {
  // Show warnings for debugging
} else {
  // Suppress in production
}
```

**Long-term fix**: Update basemap generation pipeline to include full GeoArrow metadata:

- Use geoparquet-python with GeoArrow encoding
- Or manually add extension metadata to schema

**Reference**: See [BASEMAPS.md](BASEMAPS.md) for basemap generation details.

## Performance Optimization

### Cache Strategies Explained

| Strategy                 | When to Use                      | Example                            |
| ------------------------ | -------------------------------- | ---------------------------------- |
| **CacheFirst**           | Static assets that rarely change | Basemaps, DuckDB extensions, fonts |
| **NetworkFirst**         | Data that updates frequently     | API responses, user profiles       |
| **StaleWhileRevalidate** | Balance freshness & speed        | Images, non-critical assets        |

Khartis uses **CacheFirst** exclusively because:

- All assets are version-controlled (via URL hashing)
- Offline-first is critical for field work
- Network requests are expensive for large GeoParquet files

### Cache Size Summary

| Cache Name          | Purpose                 | Max Entries | Expiration | Est. Size  |
| ------------------- | ----------------------- | ----------- | ---------- | ---------- |
| `precache`          | App shell (JS/CSS/HTML) | N/A         | N/A        | ~4MB       |
| `wasm-workers`      | WASM binaries, workers  | 20          | 90 days    | ~81MB      |
| `basemaps-data`     | GeoParquet basemaps     | 100         | 1 year     | ~25MB      |
| `duckdb-extensions` | DuckDB extensions       | 10          | 30 days    | <1MB       |
| `osm-tiles`         | OpenStreetMap tiles     | 500         | 90 days    | ~25MB      |
| `carto-tiles`       | Carto basemap tiles     | 500         | 90 days    | ~25MB      |
| `openfreemap-tiles` | OpenFreeMap tiles       | 500         | 90 days    | ~25MB      |
| **TOTAL**           |                         |             |            | **~186MB** |

**Initial install**: ~4MB (app shell only)
**After full usage**: ~186MB (all caches populated)

### Key Optimizations Applied

#### 1. WASM Files Use Runtime Caching Only

**Before**: WASM files (81MB) were precached on first visit

```typescript
// Old configuration (problematic)
globPatterns: ['**/*.{js,css,html,wasm}']; // Tries to precache 81MB
maximumFileSizeToCacheInBytes: 40 * 1024 * 1024; // Only 40MB limit!
```

**After**: WASM files load on-demand via runtime caching

```typescript
// New configuration (optimized)
globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,ttf,eot,otf}'];
globIgnores: ['**/node_modules/**/*', '**/*.wasm']; // Exclude WASM
maximumFileSizeToCacheInBytes: 10 * 1024 * 1024; // Only 10MB needed

// WASM loaded via runtime caching
runtimeCaching: [
  {
    urlPattern: /.*\.(wasm|worker\.js)$/,
    handler: 'CacheFirst',
    cacheName: 'wasm-workers'
  }
];
```

**Impact**: Initial cache size reduced by **95%** (85MB → 4MB)

#### 2. Map Tiles Cached for Offline Viewing

External map tiles from OSM, Carto, and OpenFreeMap are now cached:

```typescript
// 3 separate caches for different tile providers
{ urlPattern: /^https:\/\/(tile\.openstreetmap\.org|...)/, cacheName: 'osm-tiles' }
{ urlPattern: /^https:\/\/basemaps\.cartocdn\.com\/.../, cacheName: 'carto-tiles' }
{ urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.../, cacheName: 'openfreemap-tiles' }
```

**Impact**: App works **100% offline** after first use (including map tiles)

#### 3. Basemap Pattern Improved

**Before**: Generic pattern matched too much

```typescript
urlPattern: /\/basemaps\/.*/; // Matches everything in /basemaps/
```

**After**: Specific file extensions only

```typescript
urlPattern: /\/basemaps\/.*\.(parquet|geojson|json)$/; // Only data files
```

**Impact**: Prevents caching non-data files, cleaner cache

### Cache Size Monitoring

```typescript
// Check cache size (browser DevTools > Application > Cache Storage)
async function checkCacheSize() {
  const cacheNames = await caches.keys();

  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    console.log(`${name}: ${keys.length} files`);
  }
}

checkCacheSize();
```

**Example output**:

```
precache-v1: 45 files
wasm-workers: 7 files
basemaps-data: 16 files
osm-tiles: 234 files
carto-tiles: 156 files
```

### Clearing Caches

**Automatic**: `cleanupOutdatedCaches: true` removes old caches after update

**Manual** (for debugging):

```javascript
// Clear all caches
caches.keys().then((names) => {
  names.forEach((name) => caches.delete(name));
});

// Clear specific cache
caches.delete('osm-tiles');
```

## Migration from vite-plugin-pwa to @vite-pwa/sveltekit (Future)

Currently using `vite-plugin-pwa` (generic). For better SvelteKit integration, consider migrating to `@vite-pwa/sveltekit`:

### Benefits of @vite-pwa/sveltekit

1. **Native SPA support** - Handles SvelteKit's static adapter automatically
2. **Better fallback handling** - Uses `.svelte-kit/output/client/_app/version.json` for revisions
3. **Kit integration** - Watches kit config changes, automatic `__data.json` caching

### Migration Steps

1. Install `@vite-pwa/sveltekit`:

```bash
yarn add @vite-pwa/sveltekit -D
yarn remove vite-plugin-pwa
```

2. Update `vite.config.ts`:

```typescript
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      strategies: 'injectManifest', // or 'generateSW'
      spa: true,
      kit: {
        includeVersionFile: true
      }
      // ... rest of config remains same
    })
  ]
});
```

3. Update imports in components:

```typescript
// Before (vite-plugin-pwa)
import { useRegisterSW } from 'virtual:pwa-register/svelte';

// After (@vite-pwa/sveltekit) - same!
import { useRegisterSW } from 'virtual:pwa-register/svelte';
```

**Current status**: Migration not required - current setup works well. Consider for future major version.

## Testing PWA Features

### Local Testing

1. **Build production version**:

```bash
yarn build
yarn preview
```

2. **Open Chrome DevTools** > Application tab:
   - Check "Manifest" - should show app name, icons
   - Check "Service Workers" - should show registered worker
   - Check "Cache Storage" - should show cached assets

3. **Test offline mode**:
   - DevTools > Network tab > Set to "Offline"
   - Refresh page - app should still work

### Lighthouse Audit

```bash
# Install Lighthouse CLI
npm install -g lighthouse

# Run PWA audit
lighthouse http://localhost:4173 --view --only-categories=pwa
```

**Target scores**:

- ✅ PWA: 100/100
- ✅ Performance: 90+/100
- ✅ Accessibility: 95+/100

## References

- [Vite PWA Plugin Docs](https://vite-pwa-org.netlify.app/)
- [SvelteKit PWA Guide](https://vite-pwa-org.netlify.app/frameworks/sveltekit.html)
- [Workbox Strategies](https://developer.chrome.com/docs/workbox/modules/workbox-strategies/)
- [Web App Manifest Spec](https://www.w3.org/TR/appmanifest/)
- [PWA Assets Generator](https://github.com/vite-pwa/assets-generator)

## Version History

| Version | Date       | Changes                                                                          |
| ------- | ---------- | -------------------------------------------------------------------------------- |
| **1.0** | 2025-01    | Initial PWA configuration with vite-plugin-pwa                                   |
| **1.1** | 2025-01    | Fixed Workbox precaching errors for SvelteKit SPA mode                           |
| **1.2** | 2025-01    | Added basemap caching strategy (1 year expiration)                               |
| **1.3** | 2025-11-15 | Major optimization: WASM runtime caching, map tiles caching, 95% cache reduction |

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
