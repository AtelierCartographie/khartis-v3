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
  registerType: 'prompt',
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
navigateur ou du réseau. Les réponses transitoires 408, 425, 500, 502, 503 et
504 sont retentées brièvement par le plugin `retryTransientErrorsPlugin`. Les
réponses 403 et 429 ne sont pas répétées automatiquement.

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

Installation initiale : quelques Mo pour l'app shell. Le premier usage de
DuckDB ajoute actuellement environ 35,9 Mo sans compression HTTP, ou environ
5,5 Mo lorsque le sidecar Brotli est correctement négocié. Après utilisation
complète, la taille varie selon les fonds téléchargés.

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

Le service worker utilise le mode `prompt`. Une nouvelle version s'installe,
mais reste en attente tant que l'utilisateur n'a pas demandé son activation.
La première release qui migre depuis l'ancien mode `autoUpdate` refuse les
anciens messages `SKIP_WAITING`, qui ne prouvent pas qu'une sauvegarde a eu
lieu. Elle reste donc en attente jusqu'à la fermeture des anciens onglets ou de
l'ancienne PWA, puis s'active naturellement. À partir de cette release, le
client envoie un message versionné uniquement après une sauvegarde confirmée et
le bouton pilote normalement toutes les mises à jour suivantes.

Le composant `pwa-service-worker.svelte` est monté avant le loader de
restauration. Il peut donc enregistrer le service worker et détecter une mise à
jour même si la restauration du dernier projet est lente ou défaillante.

Le bouton latéral suit ce cycle :

1. Vérifier `_app/version.json` et appeler `registration.update()` avec le cache
   HTTP désactivé pour le script du worker.
2. Signaler si Khartis est à jour ou si un worker attend son activation.
3. Avant l'activation, terminer les écritures du projet en cours. Si la
   sauvegarde reste en échec ou dépasse son délai, ne pas activer la mise à
   jour. L'activation est également refusée hors ligne.
4. Envoyer `SKIP_WAITING` uniquement au worker en attente.
5. Recharger une seule fois après `controllerchange`, ou après confirmation de
   l'état `activated` sur les navigateurs qui ne signalent pas ce changement de
   la même façon.

Chaque onglet qui reçoit une activation lancée ailleurs termine aussi sa propre
sauvegarde avant de se recharger. Une activation reçue après un timeout relance
la sauvegarde au lieu de réutiliser une confirmation ancienne. Si cette
sauvegarde ne peut pas être confirmée, l'onglet reste ouvert et signale
l'erreur. Si deux onglets ont modifié le même projet, une révision interne
IndexedDB empêche le dernier onglet d'écraser silencieusement le premier. Le
conflit bloque la mise à jour dans l'onglet obsolète jusqu'au rechargement du
projet. Cette révision n'est pas exportée dans le fichier `.kh`.

Le service worker conserve en plus une copie bornée des fichiers JS, CSS et WASM
générés par la release précédente. Un onglet ancien peut donc encore charger un
module ou le moteur DuckDB en différé hors ligne pendant la transition.
L'artifact distant conserve aussi les assets de la release précédente pour les
onglets connectés.

Le cache HTML `app-shell` est versionné avec `VITE_APP_VERSION`. Le worker actif
ne peut donc pas servir le HTML d'une release précédente avec les nouveaux
modules.

La recherche automatique est espacée et le bouton permet une recherche
immédiate. Le flux normal ne désinscrit aucun autre service worker et ne
supprime aucun cache extérieur au scope Khartis.

Les projets et assets utilisateur sont stockés dans IndexedDB, séparément de
Cache Storage. La procédure de mise à jour n'appelle jamais
`indexedDB.deleteDatabase()` et ne supprime aucun des stores projet.

Sur iOS, Safari et la web app ajoutée à l'écran d'accueil disposent de
conteneurs de stockage distincts. Le bouton agit donc dans l'instance où il est
utilisé.

## Restauration bornée

Le démarrage ne doit jamais laisser l'app shell derrière un loader permanent.
Les ouvertures IndexedDB bloquées ont un délai terminal et la restauration du
dernier projet est interrompue après cinq minutes. Si ce délai est dépassé ou si
les données nécessaires à la restauration ne sont pas disponibles, Khartis
place uniquement l'identifiant du projet en quarantaine dans `sessionStorage`,
puis remplace la page. Cette vraie navigation arrête l'ancien contexte
JavaScript et son worker DuckDB avant d'ouvrir l'interface comme une nouvelle
session.

Ce fallback ne supprime ni le projet, ni ses assets, ni le pointeur `CURRENT`
dans IndexedDB. Il évite seulement de retenter le même projet pendant la session
courante. L'utilisateur peut ensuite le rouvrir depuis la liste des projets, ce
qui lève la quarantaine après une restauration réussie. Si `sessionStorage`
n'est pas accessible, le paramètre `restoreFallback` reste dans l'URL. La page
continue donc à ignorer cette restauration sans entrer dans une boucle de
rechargement.

Les récupérations automatiques après erreur de module, worker ou WASM appellent
un hook de sauvegarde avec timeout avant toute navigation. Si la persistance du
projet reste non confirmée, la récupération est annulée et les données en
mémoire restent affichées.

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
3. L'utilisateur peut cliquer sur **Rechercher une mise à jour** dans le menu
   latéral.
4. Si une version est prête, cliquer sur **Mettre à jour et redémarrer**.
5. Le raccourci de secours `Ctrl/Cmd + Alt + R` nettoie uniquement le service
   worker et les caches du scope Khartis. Il ne touche pas à IndexedDB.

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

Le service worker est enregistré sous le `BASE_PATH` utilisé au build. En local,
l'application est généralement servie à la racine. Pour tester un préfixe de
déploiement, lancer explicitement le build ou le serveur avec
`BASE_PATH=/cartographie/example`. Après tout changement de `BASE_PATH`, utiliser
la récupération ciblée de chaque ancien scope. Ne jamais supprimer tous les
service workers ou tous les caches de l'origine `www.sciencespo.fr`, qui est
partagée avec d'autres applications.
