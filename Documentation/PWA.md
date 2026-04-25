# PWA — Configuration et cache

> Progressive Web App : service worker Workbox, stratégies de cache, manifest, mise à jour et mode hors-ligne.

**Voir aussi** : [ARCHITECTURE.md](ARCHITECTURE.md) · [FONDS_DE_CARTE.md](FONDS_DE_CARTE.md)

---

## Vue d'ensemble

Khartis utilise `vite-plugin-pwa` (Workbox) pour le service worker. Après la première visite, l'application et ses ressources statiques fonctionnent hors-ligne. La stratégie générale est **CacheFirst** pour toutes les ressources — il n'y a aucune API distante pour les données utilisateur.

Configuration principale dans `vite.config.ts` :

```typescript
VitePWA({
  registerType: 'prompt', // l'utilisateur confirme la mise à jour
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

L'adaptateur SvelteKit utilise `fallback: 'index.html'` pour le mode SPA :

```javascript
adapter({
  pages: 'build',
  assets: 'build',
  fallback: 'index.html',
  strict: true
});
```

---

## Précache (app shell)

Le service worker précache tous les assets statiques à l'installation :

```typescript
globPatterns: ['**/*.{js,css,woff2,woff,ttf,eot,otf,splinecode}'];
globIgnores: ['**/node_modules/**/*'];
```

Les fichiers WASM sont **exclus** du précache — ils sont volumineux et chargés à la demande via le cache runtime.

---

## Cache runtime

Six règles runtime en CacheFirst dans `vite.config.ts` :

```typescript
// 1. Cœur DuckDB WASM (mvp/eh)
{ urlPattern: /.*duckdb.*\.wasm$/,
  handler: 'CacheFirst',
  options: { cacheName: 'duckdb-wasm-core',
             expiration: { maxEntries: 5, maxAgeSeconds: 365 * 86400 } } }

// 2. Extensions DuckDB depuis le CDN officiel (spatial, etc.)
{ urlPattern: /^https:\/\/extensions\.duckdb\.org\/.*/,
  handler: 'CacheFirst',
  options: { cacheName: 'duckdb-extensions-cdn',
             expiration: { maxEntries: 10, maxAgeSeconds: 365 * 86400 } } }

// 3. Extensions DuckDB locales (servies depuis /duckdb-extensions/)
{ urlPattern: /\/duckdb-extensions\/.*\.wasm$/,
  handler: 'CacheFirst',
  options: { cacheName: 'duckdb-extensions-local',
             expiration: { maxEntries: 10, maxAgeSeconds: 365 * 86400 } } }

// 4. Fonds de carte (GeoParquet, JSON métadonnées)
{ urlPattern: /\/basemaps\/.*\.(parquet|geojson|json)$/,
  handler: 'CacheFirst',
  options: { cacheName: 'basemaps-data',
             expiration: { maxEntries: 100, maxAgeSeconds: 365 * 86400 } } }

// 5. Web Workers (DuckDB worker, autres)
{ urlPattern: /.*\.worker\.js$/,
  handler: 'CacheFirst',
  options: { cacheName: 'workers',
             expiration: { maxEntries: 20, maxAgeSeconds: 90 * 86400 } } }

// 6. Images statiques
{ urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
  handler: 'CacheFirst',
  options: { cacheName: 'images',
             expiration: { maxEntries: 100, maxAgeSeconds: 30 * 86400 } } }
```

> **Tuiles OSM et autres fonds de référence** : Khartis n'embarque PAS de règle de cache runtime pour les tuiles tierces (OpenStreetMap, Carto, OpenFreeMap). Elles sont gérées par le cache HTTP standard du navigateur. Si la mise en cache offline est requise, ajouter une règle `urlPattern` dans `vite.config.ts`.

---

## Tailles de cache estimées

| Cache                     | Contenu                        | Entrées max | Expiration | Taille estimée |
| ------------------------- | ------------------------------ | ----------- | ---------- | -------------- |
| `precache`                | App shell (JS/CSS/HTML/fonts)  | —           | —          | ~4 Mo          |
| `duckdb-wasm-core`        | Bundle DuckDB WASM (mvp ou eh) | 5           | 1 an       | ~30–80 Mo      |
| `duckdb-extensions-cdn`   | Extensions distantes (spatial) | 10          | 1 an       | < 5 Mo         |
| `duckdb-extensions-local` | Extensions servies localement  | 10          | 1 an       | < 5 Mo         |
| `basemaps-data`           | GeoParquet + métadonnées       | 100         | 1 an       | ~25 Mo         |
| `workers`                 | Web Workers `.worker.js`       | 20          | 90 jours   | < 5 Mo         |
| `images`                  | PNG/JPG/SVG/GIF/WebP           | 100         | 30 jours   | < 5 Mo         |
| **Total**                 |                                |             |            | **~75–130 Mo** |

Installation initiale : ~4 Mo (app shell + WASM core dès le premier chargement DuckDB). Après utilisation complète : variable selon les fonds téléchargés.

Ces tailles sont des estimations. Vérifier les valeurs réelles dans `vite.config.ts` avant de dimensionner un quota de stockage.

---

## Manifest web app

```json
{
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#ffffff",
  "background_color": "#ffffff",
  "icons": [
    { "src": "icons/pwa-64x64.png", "sizes": "64x64" },
    { "src": "icons/pwa-192x192.png", "sizes": "192x192" },
    { "src": "icons/pwa-512x512.png", "sizes": "512x512" },
    {
      "src": "icons/maskable-512.png",
      "sizes": "512x512",
      "purpose": "maskable"
    }
  ]
}
```

Génération des icônes : `pnpm generate-pwa-assets`.

---

## Cycle de mise à jour

`registerType: 'prompt'` signifie que le service worker n'active pas la nouvelle version automatiquement. Un composant Carbon flottant (`actions`) propose la mise à jour quand une nouvelle version est disponible.

```typescript
// +layout.svelte
const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegistered(registration) {
    if (registration) {
      setInterval(() => registration.update(), 3600000); // vérification toutes les heures
    }
  }
});
```

Quand `needRefresh` est `true`, appeler `updateServiceWorker(true)` pour activer la nouvelle version et recharger la page. Les projets IndexedDB sont préservés.

---

## Mode hors-ligne

**Fonctionne entièrement hors-ligne (après premier chargement)** :

- Application complète (SPA, JS, CSS, WASM)
- Fonds de carte déjà visités (GeoParquet dans `basemaps-data`)
- Moteur DuckDB WASM et extensions spatial (dans `wasm-workers` et `duckdb-extensions`)
- Projets utilisateur (IndexedDB — jamais dans le service worker)
- Jeux de données importés (IndexedDB)

**Nécessite le réseau** :

- Premier téléchargement des fonds de carte non encore visités
- Extensions DuckDB non encore téléchargées
- Tuiles cartographiques OSM (pas de cache runtime — uniquement le cache HTTP du navigateur)

---

## Dépannage

### `bad-precaching-response`

Le service worker tente de précacher des fichiers inexistants (ex. après un changement de `BASE_PATH`). Vérifier `navigateFallback` et les `globIgnores` dans la config Workbox.

### L'application ne se met pas à jour

1. Un nouveau build doit être déployé pour régénérer les assets précachés.
2. L'utilisateur doit cliquer sur **Mettre à jour** dans la notification.
3. En développement, désinscription forcée :

```javascript
navigator.serviceWorker
  .getRegistrations()
  .then((registrations) => registrations.forEach((sw) => sw.unregister()));
location.reload();
```

### Fichiers volumineux non cachés

Le WASM DuckDB peut dépasser la limite par défaut de Workbox (`2 Mo`). Augmenter `maximumFileSizeToCacheInBytes` dans la config :

```typescript
workbox: {
  maximumFileSizeToCacheInBytes: 100 * 1024 * 1024; // 100 Mo
}
```

Attention au quota de stockage IndexedDB sur mobile (souvent limité à 20–50 % du disque disponible).

### `BASE_PATH` et service worker

`.env.sample` engage `BASE_PATH=/cartographie/khartisnewpprd`. Le service worker est enregistré à ce chemin. En local sans ce préfixe (`BASE_PATH=`), le scope du service worker change — vider le cache navigateur après chaque changement.
