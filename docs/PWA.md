# PWA — Configuration et cache

> Progressive Web App : service worker Workbox, manifest, cache applicatif,
> récupération après assets obsolètes et mise à jour.

**Voir aussi** : [ARCHITECTURE.md](ARCHITECTURE.md) · [FONDS_DE_CARTE.md](FONDS_DE_CARTE.md)

---

## Vue d'ensemble

Khartis utilise `vite-plugin-pwa` en mode `injectManifest` avec un service
worker source dans `src/sw.ts`. Le cache améliore le rechargement et permet de
réutiliser les ressources déjà visitées, mais il ne transforme pas les fonds ou
URLs jamais chargés en ressources hors-ligne. Il n'y a aucune API serveur pour
les données utilisateur.

Configuration principale dans `vite.config.ts` :

```typescript
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  registerType: 'autoUpdate',
  injectRegister: false,
  devOptions: { enabled: true, type: 'module' },
  injectManifest: {
    globPatterns: ['**/*.{js,css,html}', 'manifest.webmanifest'],
    globIgnores: [
      '**/node_modules/**/*',
      'basemaps/**',
      'tests-datasets/**',
      'screenshots/**',
      'duckdb-extensions/**'
    ],
    maximumFileSizeToCacheInBytes: 10 * 1024 * 1024
  },
  manifest: {/* voir ci-dessous */}
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

## Précache

Le service worker précache l'app shell généré par le build :

```typescript
globPatterns: ['**/*.{js,css,html}', 'manifest.webmanifest'];
globIgnores: [
  '**/node_modules/**/*',
  'basemaps/**',
  'tests-datasets/**',
  'screenshots/**',
  'duckdb-extensions/**'
];
```

Le fallback de navigation (`/` ou `BASE_PATH/`) est ajouté explicitement au
manifest de précache, puis vérifié en fin de build par `verifyServiceWorkerPrecache`.
Les gros assets métier sont exclus du précache et passent par les caches runtime.

---

## Cache runtime

Les routes runtime sont déclarées dans `src/sw.ts` :

- `app-shell` : navigation HTML en `NetworkFirst`, fallback vers le précache.
- `duckdb-wasm-core` : DuckDB WASM en `CacheFirst`.
- `duckdb-extensions-cdn` : extensions DuckDB distantes en `CacheFirst`.
- `duckdb-extensions-local` : extensions DuckDB locales en `CacheFirst`.
- `workers` : workers JavaScript en `CacheFirst`.
- `images` : images statiques en `CacheFirst`.
- `fonts` : polices en `CacheFirst`.
- `presets` : presets de projection et de style en `CacheFirst`.
- `geopf-vector-tiles` : tuiles vectorielles Géoplateforme en `StaleWhileRevalidate`.
- `openmaptiles` : tuiles `openmaptiles.geo.data.gouv.fr` en `StaleWhileRevalidate`.

Les tuiles et ressources non listées ici relèvent du cache HTTP normal du
navigateur ou du réseau. Les requêtes transitoires 403/408/425/429/5xx sont
retentées brièvement par le plugin `retryTransientErrorsPlugin`.

---

## Tailles de cache estimées

| Cache                     | Contenu                            | Entrées max | Expiration | Taille estimée |
| ------------------------- | ---------------------------------- | ----------- | ---------- | -------------- |
| `precache`                | App shell (JS/CSS/HTML + manifest) | —           | —          | Variable       |
| `app-shell`               | Navigations HTML récentes          | 4           | 30 jours   | Variable       |
| `duckdb-wasm-core`        | Bundle DuckDB WASM (mvp ou eh)     | 5           | 1 an       | ~30–80 Mo      |
| `duckdb-extensions-cdn`   | Extensions DuckDB distantes        | 10          | 1 an       | < 5 Mo         |
| `duckdb-extensions-local` | Extensions DuckDB locales          | 12          | 1 an       | < 5 Mo         |
| `workers`                 | Web Workers `.worker.js`           | 20          | 90 jours   | < 5 Mo         |
| `images`                  | Images                             | 100         | 30 jours   | < 5 Mo         |
| `fonts`                   | Polices                            | 80          | 1 an       | Variable       |
| `presets`                 | Presets projection/style           | 4           | 1 an       | < 1 Mo         |
| `geopf-vector-tiles`      | Tuiles vectorielles Géoplateforme  | 200         | 30 jours   | Variable       |
| `openmaptiles`            | Tuiles OpenMapTiles publiques      | 100         | 30 jours   | Variable       |
| **Total**                 |                                    |             |            | **~75–130 Mo** |

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
      "src": "maskable-icon-512x512.png",
      "sizes": "512x512",
      "purpose": "maskable"
    }
  ]
}
```

Génération des icônes : `pnpm generate-pwa-assets`.

---

## Cycle de mise à jour

Le service worker utilise `registerType: 'autoUpdate'` et `self.skipWaiting()`.
Le composant `pwa-service-worker.svelte` enregistre le service worker
immédiatement, vérifie `sw.ts` toutes les heures avec `cache: 'no-store'`, et
affiche une notification lorsque `vite-plugin-pwa` signale une mise à jour à
appliquer.

```typescript
// +layout.svelte
const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(swUrl, registration) {
    if (!registration) return;
    setInterval(async () => {
      const response = await fetch(swUrl, { cache: 'no-store' });
      if (response.status === 200) await registration.update();
    }, 3600000);
  }
});
```

Quand `needRefresh` est `true`, appeler `updateServiceWorker(true)` pour activer la nouvelle version et recharger la page. Les projets IndexedDB sont préservés.

---

## Ressources disponibles sans nouveau réseau

Après une visite réussie, le navigateur peut réutiliser :

- App shell déjà précaché.
- Navigations HTML récentes.
- Moteur DuckDB WASM et extensions déjà chargées.
- Images, polices, workers et presets déjà mis en cache.
- Projets utilisateur (IndexedDB — jamais dans le service worker)
- Jeux de données importés (IndexedDB)

Peut encore nécessiter le réseau :

- Premier chargement de ressources jamais visitées.
- Extensions DuckDB non encore téléchargées.
- Fonds ou tuiles cartographiques hors règles de cache explicites.
- URLs distantes fournies par l'utilisateur.

---

## Dépannage

### `bad-precaching-response`

Le service worker tente de précacher des fichiers inexistants (ex. après un changement de `BASE_PATH`). Vérifier `injectManifest.globPatterns`, `injectManifest.globIgnores`, `additionalManifestEntries`, puis le plugin `verifyServiceWorkerPrecache`.

### L'application ne se met pas à jour

1. Un nouveau build doit être déployé pour régénérer les assets précachés.
2. Le service worker vérifie `sw.ts` environ toutes les heures.
3. L'utilisateur peut cliquer sur **Mettre à jour** si une notification est affichée.
4. En développement, désinscription forcée :

```javascript
navigator.serviceWorker
  .getRegistrations()
  .then((registrations) => registrations.forEach((sw) => sw.unregister()));
location.reload();
```

### Fichiers volumineux non cachés

Le WASM DuckDB peut dépasser la limite par défaut de Workbox. La configuration
actuelle fixe `maximumFileSizeToCacheInBytes` à `10 * 1024 * 1024` pour le
précache ; les gros WASM passent par les caches runtime. Si un asset doit être
précaché et dépasse la limite, ajuster :

```typescript
injectManifest: {
  maximumFileSizeToCacheInBytes: 100 * 1024 * 1024; // 100 Mo
}
```

Attention au quota de stockage IndexedDB sur mobile (souvent limité à 20–50 % du disque disponible).

### `BASE_PATH` et service worker

Le service worker est enregistré sous le `BASE_PATH` utilisé au build. En local, l'application est généralement servie à la racine. Pour tester un préfixe de déploiement, lancer explicitement le build ou le serveur avec `BASE_PATH=/cartographie/example`. Après tout changement de `BASE_PATH`, vider le cache navigateur et désinscrire l'ancien service worker.
