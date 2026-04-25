# Khartis v3 — Documentation développeur

Khartis est un outil de cartographie thématique open source développé par Sciences Po. Il fonctionne entièrement côté client : toutes les données sont traitées dans le navigateur via DuckDB WASM et ne quittent jamais l'appareil.

---

## Démarrage rapide

```bash
corepack enable pnpm
cp .env.sample .env
pnpm install
pnpm dev
# → http://localhost:5176/cartographie/khartisnewpprd/
```

> **BASE_PATH** : `.env.sample` définit `BASE_PATH=/cartographie/khartisnewpprd` pour correspondre à l'URL de déploiement PPRD. Pour servir l'app à la racine en local, définissez `BASE_PATH=` dans votre `.env` avant de lancer le serveur.

---

## Commandes essentielles

| Commande                 | Description                                   |
| ------------------------ | --------------------------------------------- |
| `pnpm dev`               | Serveur de développement (port 5176)          |
| `pnpm build`             | Build de production (SvelteKit → `build/`)    |
| `pnpm check`             | Typecheck TypeScript + Svelte                 |
| `pnpm lint`              | Prettier + ESLint                             |
| `pnpm format`            | Formatage automatique                         |
| `pnpm test:unit`         | Tests Vitest client (jsdom)                   |
| `pnpm test:pipeline`     | Tests serveur pipeline + DuckDB               |
| `pnpm test:duckdb`       | Tests intégration DuckDB (`@duckdb/node-api`) |
| `pnpm test:all`          | Suite complète                                |
| `pnpm machine-translate` | Générer les traductions manquantes (Inlang)   |

---

## Stack technique

| Technologie                         | Rôle                                                         |
| ----------------------------------- | ------------------------------------------------------------ |
| SvelteKit + Svelte 5 Runes          | Framework SPA, rendu réactif (adaptateur statique)           |
| TypeScript strict                   | Typage statique — jamais `any`                               |
| DuckDB WASM                         | Moteur SQL en mémoire, traitement de toutes les données      |
| Deck.gl                             | Rendu cartographique GPU (couches thématiques GeoArrow)      |
| MapLibre GL                         | Rendu fonds de carte en tuiles vectorielles OSM              |
| Apache Arrow + geoarrow-deck-stream | Passerelle DuckDB → Deck.gl (buffers binaires)               |
| Carbon Components Svelte            | UI IBM Design System                                         |
| d3-geo + d3-geo-projection          | Projections intégrées (Robinson, Natural Earth, etc.)        |
| proj4                               | Fallback reprojection pour EPSG:2154 et variantes françaises |
| parquet-wasm                        | Lecture GeoParquet côté client (sans DuckDB)                 |
| Paraglide JS                        | Internationalisation compile-time (FR/EN)                    |
| IndexedDB                           | Persistance locale des projets et des assets source          |
| Vitest                              | Tests unitaires et d'intégration                             |

---

## Documentation développeur

| Document                                     | Contenu                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)           | Principes fondamentaux, flux global, couches d'architecture             |
| [GUIDE_DEVELOPPEUR.md](GUIDE_DEVELOPPEUR.md) | Installation, structure du projet, patterns, règles                     |
| [PIPELINE_DONNEES.md](PIPELINE_DONNEES.md)   | Import de fichiers : formats, détection, validation, processeurs        |
| [DUCKDB.md](DUCKDB.md)                       | Moteur DuckDB WASM : façade, orchestrateur, macros SQL                  |
| [MAP.md](MAP.md)                             | Rendu Deck.gl / MapLibre, caches WeakMap, projections, layers           |
| [GESTION_ETAT.md](GESTION_ETAT.md)           | Stores Svelte 5, persistance IndexedDB, undo/redo                       |
| [CARTOGRAPHIE.md](CARTOGRAPHIE.md)           | Concepts cartographiques : semio, discrétisation, couleurs, projections |
| [VISUALISATIONS.md](VISUALISATIONS.md)       | Workflow 3 étapes, outils de visualisation, habillage, export           |
| [FONDS_DE_CARTE.md](FONDS_DE_CARTE.md)       | Format, préparation et catalogue des fonds GeoParquet                   |
| [LEGENDES.md](LEGENDES.md)                   | Système de légendes SVG, familles, sécurité                             |
| [GESTION_ETAT.md](GESTION_ETAT.md)           | Stores, persistance, snapshot projet, undo/redo                         |
| [REFERENCE.md](REFERENCE.md)                 | Types TypeScript, erreurs, logger, raccourcis clavier                   |
| [PWA.md](PWA.md)                             | Progressive Web App, stratégies de cache, mises à jour                  |
| [GLOSSAIRE.md](GLOSSAIRE.md)                 | Termes cartographiques et techniques pour les développeurs              |

---

## Principes clés

- **Client-only** : aucune donnée utilisateur n'est envoyée à un serveur.
- **DuckDB-first** : tout traitement de données passe par SQL — pas de parsers JS.
- **GPU-first** : rendu via Deck.gl WebGL sur buffers GeoArrow binaires — pas de GeoJSON pour la visualisation.
- **Svelte 5 Runes** : `$state`, `$derived`, `$effect` uniquement — pas de stores Svelte 4.
- **Feature-based layout** : chaque feature dans `src/lib/features/` est autonome (store, composants, types, services).

---

## Prérequis

- Node.js ≥ 22 (< 25)
- pnpm 10 via Corepack
- Navigateur moderne (Chrome, Firefox, Safari, Edge)
