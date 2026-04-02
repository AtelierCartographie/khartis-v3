# Configuration PWA

> Progressive Web App : installation, cache hors-ligne et mises a jour.

**Voir aussi** : [Architecture](./ARCHITECTURE.md) | [Fonds de carte](./FONDS_DE_CARTE.md)

---

## Vue d'ensemble

Khartis v3 utilise `vite-plugin-pwa` (Workbox) pour fonctionner hors-ligne apres la premiere visite. L'application peut etre installee sur l'appareil, met en cache les fonds de carte et le moteur DuckDB WASM, et propose des mises a jour automatiques.

## Configuration principale

### SvelteKit (adapter-static, mode SPA)

```js
adapter({
  pages: 'build',
  assets: 'build',
  fallback: 'index.html',
  strict: true
});
```

### vite-plugin-pwa

```ts
VitePWA({
  registerType: 'prompt',
  devOptions: { enabled: true, type: 'module' },
  includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
  workbox: { /* voir ci-dessous */ },
  manifest: { /* voir ci-dessous */ }
});
```

## Strategies de cache

CacheFirst pour toutes les ressources (contenu statique, immutable). Aucune API distante n'est appelee (architecture client-only).

### Precache (app shell)

```ts
globPatterns: ['**/*.{js,css,woff2,woff,ttf,eot,otf,splinecode}'];
globIgnores: ['**/node_modules/**/*'];
```

Les fichiers WASM sont exclus du precache et charges a la demande via le cache runtime.

### Cache runtime

```ts
// Extensions DuckDB
{ urlPattern: /^https:\/\/extensions\.duckdb\.org\/.*/, handler: 'CacheFirst',
  options: { cacheName: 'duckdb-extensions', expiration: { maxEntries: 10, maxAgeSeconds: 30 * 86400 } } }

// Fonds de carte (GeoParquet)
{ urlPattern: /\/basemaps\/.*\.(parquet|geojson|json)$/, handler: 'CacheFirst',
  options: { cacheName: 'basemaps-data', expiration: { maxEntries: 100, maxAgeSeconds: 365 * 86400 } } }

// WASM et workers
{ urlPattern: /.*\.(wasm|worker\.js)$/, handler: 'CacheFirst',
  options: { cacheName: 'wasm-workers', expiration: { maxEntries: 20, maxAgeSeconds: 90 * 86400 } } }

// Tuiles cartographiques (OSM, Carto, OpenFreeMap)
{ urlPattern: /^https:\/\/(tile\.openstreetmap\.org|...)\/.*/, handler: 'CacheFirst',
  options: { cacheName: 'osm-tiles', expiration: { maxEntries: 500, maxAgeSeconds: 90 * 86400 } } }
```

## Tailles de cache estimees

> **Note** : ces tailles sont des estimations susceptibles de changer. Verifier les valeurs reelles dans `vite.config.ts` et `tsconfig.json` avant de s'y fier pour le dimensionnement d'un dispositif de stockage.

| Cache               | Contenu                    | Entrees max | Expiration | Taille estimee |
| ------------------- | -------------------------- | ----------- | ---------- | -------------- |
| `precache`          | App shell (JS/CSS/HTML)    | --          | --         | ~4 Mo          |
| `wasm-workers`      | Binaires WASM, workers     | 20          | 90 jours   | ~81 Mo         |
| `basemaps-data`     | GeoParquet fonds de carte   | 100         | 1 an       | ~25 Mo         |
| `duckdb-extensions` | Extensions DuckDB          | 10          | 30 jours   | < 1 Mo         |
| `osm-tiles`         | Tuiles OpenStreetMap       | 500         | 90 jours   | ~25 Mo         |
| `carto-tiles`       | Tuiles Carto               | 500         | 90 jours   | ~25 Mo         |
| `openfreemap-tiles` | Tuiles OpenFreeMap         | 500         | 90 jours   | ~25 Mo         |
| **Total**           |                            |             |            | **~186 Mo**    |

Installation initiale : ~4 Mo. Apres utilisation complete : ~186 Mo.

## Manifest web app

Le manifest declare `display: 'standalone'`, `orientation: 'portrait'`, avec 4 icones (64, 192, 512 + 512 maskable). Generation des icones : `pnpm generate-pwa-assets`.

## Mise a jour

Le service worker verifie les mises a jour toutes les heures. Quand une nouvelle version est detectee, une notification inline propose la mise a jour. Les projets IndexedDB sont preserves.

```ts
const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegistered(registration) {
    if (registration) setInterval(() => registration.update(), 3600000);
  }
});
```

## Mode hors-ligne

**Fonctionne hors-ligne** : application complete, fonds de carte caches, DuckDB WASM, projets utilisateur (IndexedDB), jeux de donnees importes.

**Necessite le reseau** (premiere fois seulement) : telechargement des fonds de carte, extensions DuckDB, tuiles cartographiques.

## Depannage

### Erreur `bad-precaching-response`

Le service worker tente de precacher des fichiers inexistants. Verifier `navigateFallback` et les `globIgnores`.

### L'application ne se met pas a jour

- Incrementer la version dans `package.json` avant le build
- L'utilisateur doit cliquer sur "Mettre a jour"
- En dev, desinscription forcee :

```js
navigator.serviceWorker
  .getRegistrations()
  .then((r) => r.forEach((sw) => sw.unregister()));
location.reload();
```

### Fichiers volumineux non caches

Augmenter `maximumFileSizeToCacheInBytes` dans la config Workbox. Attention au quota de stockage sur mobile.

---

**Voir aussi :** [ARCHITECTURE.md](./ARCHITECTURE.md) -- [FONDS_DE_CARTE.md](./FONDS_DE_CARTE.md)
