# Configuration PWA

> Progressive Web App : installation, cache hors-ligne et mises à jour.

**Voir aussi** : [Architecture](./ARCHITECTURE.md) | [Fonds de carte](./FONDS_DE_CARTE.md)

---

## Vue d'ensemble

Khartis v3 utilise `vite-plugin-pwa` (Workbox) pour fonctionner hors-ligne après la première visite. L'application peut être installée sur l'appareil, met en cache les fonds de carte et le moteur DuckDB WASM, et propose des mises à jour automatiques.

---

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
  workbox: {
    /* voir ci-dessous */
  },
  manifest: {
    /* voir ci-dessous */
  }
});
```

---

## Stratégies de cache

CacheFirst pour toutes les ressources (contenu statique, immutable). Aucune API distante n'est appelée (architecture client-only).

### Précache (app shell)

```ts
globPatterns: ['**/*.{js,css,woff2,woff,ttf,eot,otf,splinecode}'];
globIgnores: ['**/node_modules/**/*'];
```

Les fichiers WASM sont exclus du précache et chargés à la demande via le cache runtime.

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

---

## Tailles de cache estimées

> **Note** : ces tailles sont des estimations susceptibles de changer. Vérifier les valeurs réelles dans `vite.config.ts` et `tsconfig.json` avant de s'y fier pour le dimensionnement d'un dispositif de stockage.

| Cache               | Contenu                   | Entrées max | Expiration | Taille estimée |
| ------------------- | ------------------------- | ----------- | ---------- | -------------- |
| `precache`          | App shell (JS/CSS/HTML)   | —           | —          | ~4 Mo          |
| `wasm-workers`      | Binaires WASM, workers    | 20          | 90 jours   | ~81 Mo         |
| `basemaps-data`     | GeoParquet fonds de carte | 100         | 1 an       | ~25 Mo         |
| `duckdb-extensions` | Extensions DuckDB         | 10          | 30 jours   | < 1 Mo         |
| `osm-tiles`         | Tuiles OpenStreetMap      | 500         | 90 jours   | ~25 Mo         |
| `carto-tiles`       | Tuiles Carto              | 500         | 90 jours   | ~25 Mo         |
| `openfreemap-tiles` | Tuiles OpenFreeMap        | 500         | 90 jours   | ~25 Mo         |
| **Total**           |                           |             |            | **~186 Mo**    |

Installation initiale : ~4 Mo. Après une utilisation complète : ~186 Mo.

---

## Manifest web app

Le manifest déclare `display: 'standalone'`, `orientation: 'portrait'`, avec 4 icônes (64, 192, 512 + 512 maskable). Génération des icônes : `pnpm generate-pwa-assets`.

---

## Mise à jour

Le service worker vérifie les mises à jour toutes les heures. Quand une nouvelle version est détectée, une notification Carbon flottante propose la mise à jour à l'emplacement prévu par le composant (`actions`). Les projets IndexedDB sont préservés.

```ts
const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegistered(registration) {
    if (registration) setInterval(() => registration.update(), 3600000);
  }
});
```

---

## Mode hors-ligne

**Fonctionne hors-ligne** : application complète, fonds de carte cachés, DuckDB WASM, projets utilisateur (IndexedDB), jeux de données importés.

**Nécessite le réseau** (première fois uniquement) : téléchargement des fonds de carte, extensions DuckDB, tuiles cartographiques.

---

## Dépannage

### Erreur `bad-precaching-response`

Le service worker tente de précacher des fichiers inexistants. Vérifier `navigateFallback` et les `globIgnores`.

### L'application ne se met pas à jour

- Incrémenter la version dans `package.json` avant le build.
- L'utilisateur doit cliquer sur **Mettre à jour**.
- En dev, désinscription forcée :

```js
navigator.serviceWorker
  .getRegistrations()
  .then((r) => r.forEach((sw) => sw.unregister()));
location.reload();
```

### Fichiers volumineux non cachés

Augmenter `maximumFileSizeToCacheInBytes` dans la config Workbox. Attention au quota de stockage sur mobile.

---

**Voir aussi :** [ARCHITECTURE.md](./ARCHITECTURE.md) — [FONDS_DE_CARTE.md](./FONDS_DE_CARTE.md)
