# Khartis v3 — Documentation développeur

Khartis est un outil de cartographie thématique open source développé par Sciences Po (Atelier de cartographie). Il fonctionne **entièrement dans le navigateur** : les données ne quittent jamais l'appareil de l'utilisateur. Le traitement SQL, la projection cartographique et le rendu GPU s'exécutent tous côté client.

---

## Démarrage rapide

```bash
corepack enable pnpm        # Active pnpm via Corepack (Node >= 22)
cp .env.sample .env         # Copie la configuration locale (aucun secret)
pnpm install                # Installe les dépendances
pnpm dev                    # Lance le serveur de dev
```

L'application est accessible à `http://localhost:5176/cartographie/khartisnewpprd/`.

> **BASE_PATH** : `.env.sample` configure `BASE_PATH=/cartographie/khartisnewpprd` pour correspondre à l'URL de déploiement PPRD. Pour servir l'application à la racine en local, définissez `BASE_PATH=` dans `.env` avant de lancer le serveur.

---

## Stack technique

| Technologie                         | Version   | Rôle                                                               |
| ----------------------------------- | --------- | ------------------------------------------------------------------ |
| SvelteKit + Svelte 5 Runes          | 2.x / 5.x | Framework SPA, adaptateur statique, réactivité par runes           |
| TypeScript                          | 6.x       | Typage strict — jamais `any`                                       |
| DuckDB WASM                         | 1.x       | Moteur SQL analytique en mémoire, chargé dans un Web Worker        |
| Deck.gl                             | 9.x       | Rendu cartographique GPU, couches thématiques sur buffers GeoArrow |
| MapLibre GL                         | 5.x       | Rendu des fonds de carte en tuiles vectorielles (OSM)              |
| Apache Arrow + geoarrow-deck-stream | —         | Passerelle binaire DuckDB → Deck.gl                                |
| Carbon Components Svelte            | 0.106.x   | Composants UI (IBM Design System) — Svelte 4 source                |
| d3-geo + d3-geo-projection          | —         | Projections intégrées (Robinson, Natural Earth, Mercator…)         |
| proj4                               | —         | Fallback reprojection pour EPSG:2154 et variantes françaises       |
| parquet-wasm                        | —         | Lecture GeoParquet côté client sans DuckDB                         |
| Paraglide JS                        | 2.x       | i18n compile-time, deux locales (FR/EN)                            |
| IndexedDB                           | —         | Persistance locale des projets et assets source (chunks 8 Mo)      |
| Vitest                              | 4.x       | Tests unitaires (jsdom) et intégration (Node)                      |

> Versions exactes au moment de la rédaction : SvelteKit 2.58, Svelte 5.55, TypeScript 6.0, DuckDB WASM 1.33-dev, Deck.gl 9.x, MapLibre GL 5.24, Carbon 0.106.2, Paraglide 2.16, Vitest 4.1. Vérifier `package.json` pour la valeur exacte avant toute mise à niveau.

---

## Commandes essentielles

| Commande                 | Description                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| `pnpm dev`               | Serveur de développement (port 5176, HMR)                          |
| `pnpm build`             | Build de production → `build/` (SvelteKit adapter-static)          |
| `pnpm check`             | Typecheck TypeScript + Svelte (`svelte-kit sync` + `svelte-check`) |
| `pnpm lint`              | Prettier (vérification) + ESLint                                   |
| `pnpm format`            | Prettier (réécriture)                                              |
| `pnpm test:unit`         | Vitest client jsdom — co-localisé `src/**/*.svelte.test.ts`        |
| `pnpm test:pipeline`     | Vitest server Node — `tests/pipeline/**`                           |
| `pnpm test:duckdb`       | Vitest server Node — `tests/duckdb/**` (DuckDB natif)              |
| `pnpm test:all`          | Suite complète (unit + pipeline + duckdb)                          |
| `pnpm machine-translate` | Génère les clés i18n manquantes via Inlang                         |

> Utiliser toujours `vitest run` (ou les scripts `pnpm test:*`), jamais `vitest` seul qui démarre le mode watch. En CI ou agent, ajouter `--reporter=agent` pour minimiser la sortie.

---

## Documents disponibles

| Document                                     | Ce qu'il couvre                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)           | Principes fondamentaux, flux global, couches techniques                      |
| [GUIDE_DEVELOPPEUR.md](GUIDE_DEVELOPPEUR.md) | Structure du projet, patterns Svelte 5, règles et conventions                |
| [PIPELINE_DONNEES.md](PIPELINE_DONNEES.md)   | Import de fichiers : formats supportés, détection, validation, processeurs   |
| [DUCKDB.md](DUCKDB.md)                       | Moteur DuckDB WASM : façade Duck, orchestrateur, macros SQL                  |
| [MAP.md](MAP.md)                             | Rendu Deck.gl / MapLibre : pipeline, caches WeakMap, projections, layers     |
| [CARTOGRAPHIE.md](CARTOGRAPHIE.md)           | Concepts cartographiques : sémiotique, discrétisation, couleurs, projections |
| [VISUALISATIONS.md](VISUALISATIONS.md)       | Workflow 3 étapes, outils de la barre droite, habillage, export              |
| [GESTION_ETAT.md](GESTION_ETAT.md)           | Stores Svelte 5, persistance IndexedDB, snapshot projet, undo/redo           |
| [FONDS_DE_CARTE.md](FONDS_DE_CARTE.md)       | Format GeoParquet, préparation et catalogue des fonds inclus                 |
| [LEGENDES.md](LEGENDES.md)                   | Système de légendes SVG, familles, extensions Khartis, sécurité              |
| [REFERENCE.md](REFERENCE.md)                 | Types TypeScript, hiérarchie d'erreurs, logger, raccourcis clavier           |
| [PWA.md](PWA.md)                             | Progressive Web App, stratégies de cache Workbox, mises à jour               |
| [GLOSSAIRE.md](GLOSSAIRE.md)                 | Termes cartographiques et techniques du point de vue du développeur          |

---

## Principes fondamentaux

- **Client-only** : aucune donnée utilisateur n'est transmise à un serveur.
- **DuckDB-first** : tout traitement de données (jointure, classification, reprojection, agrégation) passe par SQL — pas de parsers JavaScript maison.
- **GPU-first** : le rendu thématique utilise Deck.gl sur des buffers GeoArrow binaires. GeoJSON est un format d'export ou de fallback, jamais le chemin de visualisation principal.
- **Svelte 5 Runes** : `$state`, `$derived`, `$effect` exclusivement — aucun store Svelte 4 (`writable`, `$:`, `export let`).
- **Feature-based layout** : chaque feature dans `src/lib/features/` est autonome (store, composants, types, services). Les features ne s'importent pas directement entre elles — elles passent par `commons/` ou des APIs explicites.
