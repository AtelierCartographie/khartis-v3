# Khartis v3 — Documentation développeur

Khartis est un outil de cartographie thématique open source pour créer des cartes de qualité publication. Développé par l'Atelier de cartographie de Sciences Po, il fonctionne **entièrement dans le navigateur** : vos données ne quittent jamais votre ordinateur. Le traitement SQL, la projection et le rendu GPU s'exécutent côté client, garantissant performance et confidentialité.

---

## Démarrage rapide

```bash
corepack enable pnpm        # Active pnpm via Corepack (Node >= 22)
pnpm install                # Installe les dépendances
pnpm dev                    # Lance le serveur de dev
```

L'application est accessible à `http://localhost:5176/`.

Le fichier `.env.example` sert uniquement au helper de déploiement local PPRD. Il ne doit contenir que des placeholders publics, jamais de valeurs réelles d'infrastructure.

---

## Stack technique

| Technologie                         | Version   | Rôle                                                                |
| ----------------------------------- | --------- | ------------------------------------------------------------------- |
| SvelteKit + Svelte 5 Runes          | 2.x / 5.x | Framework SPA, adaptateur statique, réactivité par runes            |
| TypeScript                          | 6.x       | Typage strict — jamais `any`                                        |
| DuckDB WASM                         | 1.x       | Moteur SQL analytique en mémoire, chargé dans un Web Worker         |
| Deck.gl                             | 9.x       | Rendu cartographique GPU, couches thématiques sur buffers GeoArrow  |
| MapLibre GL                         | 5.x       | Rendu des fonds de carte en tuiles vectorielles (OSM)               |
| Apache Arrow + geoarrow-deck-stream | —         | Passerelle binaire DuckDB → Deck.gl pour un rendu haute performance |
| Carbon Components Svelte            | 0.109.x   | Composants UI (IBM Design System) — Svelte 4 source                 |
| d3-geo + d3-geo-projection          | —         | Projections intégrées (Robinson, Natural Earth, Mercator…)          |
| proj4                               | —         | Fallback reprojection pour EPSG:2154 et variantes françaises        |
| parquet-wasm                        | —         | Lecture GeoParquet côté client sans DuckDB                          |
| Paraglide JS                        | 2.x       | i18n compile-time, deux locales (FR/EN)                             |
| IndexedDB                           | —         | Persistance locale des projets et assets source (chunks 8 Mo)       |
| Vitest                              | 4.x       | Tests unitaires (jsdom) et intégration (Node)                       |

> Versions exactes au moment de la rédaction : vérifier `package.json` avant toute mise à niveau. Les valeurs mineures évoluent avec les dépendances.

---

## Commandes essentielles

| Commande                   | Description                                                        |
| -------------------------- | ------------------------------------------------------------------ |
| `pnpm dev`                 | Serveur de développement (port 5176, HMR)                          |
| `pnpm build`               | Build de production → `build/` (SvelteKit adapter-static)          |
| `pnpm check`               | Typecheck TypeScript + Svelte (`svelte-kit sync` + `svelte-check`) |
| `pnpm lint`                | Prettier (vérification) + ESLint                                   |
| `pnpm format`              | Prettier (réécriture)                                              |
| `pnpm deploy:pprd:dry-run` | Vérifie le tag PPRD, le gate CI et le build sans SFTP              |
| `pnpm deploy:pprd`         | Déploie le dernier tag PPRD via le helper local SFTP               |
| `pnpm test:unit`           | Vitest client jsdom — co-localisé `src/**/*.svelte.test.ts`        |
| `pnpm test:pipeline`       | Vitest server Node — `tests/pipeline/**`                           |
| `pnpm test:duckdb`         | Vitest server Node — `tests/duckdb/**` (DuckDB natif)              |
| `pnpm test:all`            | Suite complète (unit + pipeline + duckdb)                          |
| `pnpm machine-translate`   | Génère les clés i18n manquantes via Inlang                         |

> Utiliser toujours `vitest run` (ou les scripts `pnpm test:*`), jamais `vitest` seul qui démarre le mode watch. En CI ou agent, ajouter `--reporter=agent` pour minimiser la sortie.

---

## Documents disponibles

| Document                                                           | Ce qu'il couvre                                                               |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                 | Principes fondamentaux, flux global, couches techniques                       |
| [ARCHITECTURE_FEATURES.md](ARCHITECTURE_FEATURES.md)               | Justification du découpage de chaque feature et guidelines pour en créer      |
| [GUIDE_DEVELOPPEUR.md](GUIDE_DEVELOPPEUR.md)                       | Structure du projet, patterns Svelte 5, règles et conventions                 |
| [PIPELINE_DONNEES.md](PIPELINE_DONNEES.md)                         | Import de fichiers : formats supportés, détection, validation, processeurs    |
| [DUCKDB.md](DUCKDB.md)                                             | Moteur DuckDB WASM : façade Duck, orchestrateur, macros SQL                   |
| [MAP.md](MAP.md)                                                   | Rendu Deck.gl / MapLibre : pipeline, caches WeakMap, projections, layers      |
| [CARTOGRAPHIE.md](CARTOGRAPHIE.md)                                 | Concepts cartographiques : sémiotique, discrétisation, couleurs, projections  |
| [VISUALISATIONS.md](VISUALISATIONS.md)                             | Workflow 3 étapes, outils de la barre droite, habillage, export               |
| [SUGGESTION_VISUALISATION.md](SUGGESTION_VISUALISATION.md)         | Algorithme de suggestion : typage sémiologique des colonnes, patterns, scores |
| [GESTION_ETAT.md](GESTION_ETAT.md)                                 | Stores Svelte 5, persistance IndexedDB, snapshot projet, undo/redo            |
| [PROJECT_FORMAT_COMPATIBILITY.md](PROJECT_FORMAT_COMPATIBILITY.md) | Baseline publique `.kh`, migrations de schéma et compatibilité future         |
| [FONDS_DE_CARTE.md](FONDS_DE_CARTE.md)                             | Format GeoParquet, préparation et catalogue des fonds inclus                  |
| [LEGENDES.md](LEGENDES.md)                                         | Système de légendes SVG, familles, extensions Khartis, sécurité               |
| [REFERENCE.md](REFERENCE.md)                                       | Types TypeScript, hiérarchie d'erreurs, logger, raccourcis clavier            |
| [PWA.md](PWA.md)                                                   | Progressive Web App, stratégies de cache Workbox, mises à jour                |
| [GLOSSAIRE.md](GLOSSAIRE.md)                                       | Termes cartographiques et techniques du point de vue du développeur           |
| [DEPLOYMENT.md](DEPLOYMENT.md)                                     | Déploiement local PPRD et PROD, variables locales, garde-fous SFTP            |
| [ANALYTICS.md](ANALYTICS.md)                                       | Consentement, container Google Tag Manager, évènements anonymes               |

---

## Principes fondamentaux

- **Client-only** : Aucune donnée utilisateur n'est transmise à un serveur. Tout s'exécute dans le navigateur, garantissant une confidentialité totale.
- **DuckDB-first** : Tout traitement de données (jointure, classification, reprojection, agrégation) passe par le moteur **SQL** DuckDB WASM. Pas de parseurs JavaScript lents et faillibles pour les formats supportés.
- **GPU-first** : Le rendu thématique utilise **Deck.gl** sur des buffers binaires **GeoArrow**. Le format GeoJSON n'est utilisé qu'en fallback ou pour l'export, jamais sur le chemin critique du rendu.
- **Svelte 5 Runes** : L'état est géré via les runes (`$state`, `$derived`, `$effect`), offrant une réactivité prédictible et performante sans l'overhead des stores Svelte 4.
- **Feature-based layout** : Le code est organisé en _features_ autonomes (`src/lib/features/`). Elles ne communiquent que via des stores ou des APIs partagées, limitant le couplage.
