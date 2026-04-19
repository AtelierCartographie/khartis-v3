# Khartis v3 — Documentation

Khartis est un outil de cartographie thématique open source développé par Sciences Po. Entièrement client-side, il permet de créer des cartes à partir de données tabulaires ou géographiques en trois étapes : **Données**, **Visualisations**, **Habillage**. Aucune donnée ne quitte le navigateur.

---

## Table des matières

### Pour les utilisateurs

| Document                                        | Description                                                |
| ----------------------------------------------- | ---------------------------------------------------------- |
| [Guide utilisateur](GUIDE_UTILISATEUR.md)       | Prise en main des 3 étapes : import, visualisation, export |
| [Cheat sheet exemples](CHEAT_SHEET_EXEMPLES.md) | 5 exemples d'import par URL pour prendre Khartis en main   |
| [Glossaire](GLOSSAIRE.md)                       | Définitions des termes cartographiques et techniques       |

### Pour les développeurs

| Document                                   | Description                                              |
| ------------------------------------------ | -------------------------------------------------------- |
| [Guide développeur](GUIDE_DEVELOPPEUR.md)  | Démarrage rapide, règles, tâches courantes               |
| [Architecture](ARCHITECTURE.md)            | Conception du système, principes, modèles mentaux        |
| [Pipeline de données](PIPELINE_DONNEES.md) | Import, validation, traitement, export                   |
| [DuckDB](DUCKDB.md)                        | Moteur WASM, orchestrateur, macros SQL                   |
| [Cartographie](CARTOGRAPHIE.md)            | Sémiotique, discrétisation, couleurs, projections        |
| [Visualisations](VISUALISATIONS.md)        | Parcours utilisateur, outils de viz, habillage           |
| [Rendu carte](MAP.md)                      | Pipeline Deck.gl / MapLibre, caches WeakMap, projections |
| [Fonds de carte](FONDS_DE_CARTE.md)        | Préparation, formats et catalogue des fonds de carte     |
| [Gestion d'état](GESTION_ETAT.md)          | Stores, persistance, patterns de features                |
| [Référence](REFERENCE.md)                  | Types, erreurs, raccourcis clavier                       |
| [PWA](PWA.md)                              | Progressive Web App, support hors-ligne, cache           |

### Contribution et sécurité

- [CONTRIBUTING.md](../CONTRIBUTING.md) — Guide de contribution
- [SECURITY.md](../SECURITY.md) — Politique de sécurité

---

## Démarrage rapide

```bash
corepack enable pnpm
cp .env.sample .env
pnpm install
pnpm dev
```

Ouvrir [http://localhost:5176/](http://localhost:5176/).

Le fichier `.env` doit être créé avant de lancer l'application. Le sample committé (`.env.sample`) ne contient que des valeurs non confidentielles. Par défaut, il conserve le `BASE_PATH` PPRD pour les tests avec préfixe de déploiement ; pour servir l'application à la racine en local, définissez `BASE_PATH=` dans votre `.env` puis relancez le serveur.

---

## Stack technique

| Technologie                | Rôle                                                         |
| -------------------------- | ------------------------------------------------------------ |
| SvelteKit (Svelte 5 Runes) | Framework applicatif, rendu réactif (adaptateur statique)    |
| TypeScript                 | Typage statique strict                                       |
| DuckDB WASM                | Moteur de requêtes SQL en mémoire, traitement des données    |
| Deck.gl                    | Rendu cartographique GPU (couches thématiques GeoArrow)      |
| MapLibre GL                | Rendu des fonds de carte en tuiles (vectorielles OSM)        |
| Carbon Components Svelte   | Composants UI (IBM)                                          |
| Apache Arrow               | Format columnar en mémoire, passerelle DuckDB / Deck.gl      |
| geoarrow-deck-stream       | Parsing GeoArrow → buffers binaires Deck.gl (fork interne)   |
| d3-geo + d3-geo-projection | Projections intégrées (Robinson, Natural Earth, etc.)        |
| proj4                      | Projections exotiques, fallback reprojection EPSG:2154/27572 |
| parquet-wasm               | Lecture GeoParquet côté client                               |
| Paraglide JS               | Internationalisation compile-time (FR/EN)                    |
| IndexedDB                  | Persistance locale des projets et des assets source          |
| Vitest                     | Tests unitaires et d'intégration (pipeline + DuckDB natif)   |

---

## Principes clés

- **Client-only** : aucune donnée ne quitte le navigateur.
- **DuckDB-first** : tout le traitement de données passe par SQL (pas de parser JS).
- **GPU-first** : rendu via Deck.gl WebGL, pas de GeoJSON JS pour les visualisations.
- **Svelte 5 Runes** : `$state`, `$derived`, `$effect` uniquement — jamais de stores Svelte 4.
