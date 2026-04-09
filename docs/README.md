# Khartis v3 -- Documentation

Khartis est un outil de cartographie thematique open source developpe par Sciences Po. Entierement client-side, il permet de creer des cartes a partir de donnees tabulaires ou geographiques en trois etapes : **Donnees**, **Visualisations**, **Habillage**. Aucune donnee ne quitte le navigateur.

---

## Table des matieres

### Pour les utilisateurs

| Document                                        | Description                                               |
| ----------------------------------------------- | --------------------------------------------------------- |
| [Guide utilisateur](GUIDE_UTILISATEUR.md)       | Prise en main des 3 etapes, import, visualisation, export |
| [Cheat sheet exemples](CHEAT_SHEET_EXEMPLES.md) | 5 exemples d'import par URL pour prendre Khartis en main  |
| [Glossaire](GLOSSAIRE.md)                       | Definitions des termes cartographiques et techniques      |

### Pour les developpeurs

| Document                                   | Description                                          |
| ------------------------------------------ | ---------------------------------------------------- |
| [Guide developpeur](GUIDE_DEVELOPPEUR.md)  | Demarrage rapide, regles, taches courantes           |
| [Architecture](ARCHITECTURE.md)            | Conception du systeme, principes, modeles mentaux    |
| [Pipeline de donnees](PIPELINE_DONNEES.md) | Import, validation, traitement, export               |
| [Visualisations](VISUALISATIONS.md)        | Configuration des cartes thematiques et rendu GPU    |
| [Gestion d'etat](GESTION_ETAT.md)          | Stores, persistance, patterns de features            |
| [Fonds de carte](FONDS_DE_CARTE.md)        | Preparation, formats et catalogue des fonds de carte |
| [Tests](TESTS.md)                          | Tests unitaires, integration et end-to-end           |
| [Reference](REFERENCE.md)                  | Types, utilitaires, raccourcis clavier               |
| [PWA](PWA.md)                              | Progressive Web App, support hors-ligne, cache       |

### Contribution et securite

- [CONTRIBUTING.md](../CONTRIBUTING.md) -- Guide de contribution
- [SECURITY.md](../SECURITY.md) -- Politique de securite

---

## Demarrage rapide

```bash
corepack enable pnpm
cp .env.sample .env
pnpm install
pnpm dev
```

Ouvrir [http://localhost:5176/](http://localhost:5176/).

Le fichier `.env` doit etre cree avant de lancer l'application. Le sample committe (`.env.sample`) ne contient que des valeurs non confidentielles. Par defaut il garde le `BASE_PATH` PPRD pour les tests avec prefixe de deploiement ; mettez `BASE_PATH=` dans `.env` si vous voulez servir l'application a la racine en local.

---

## Stack technique

| Technologie                   | Role                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| SvelteKit 2 (Svelte 5 Runes)  | Framework applicatif, rendu reactif (static adapter)         |
| TypeScript                    | Typage statique strict                                       |
| DuckDB WASM 1.33              | Moteur de requetes SQL en memoire, traitement des donnees    |
| Deck.gl 9.2                   | Rendu cartographique GPU (couches thematiques GeoArrow)      |
| MapLibre GL 5                 | Rendu des fonds de carte tuiles (vectorielles OSM)           |
| Carbon Components Svelte 0.96 | Composants UI (IBM)                                          |
| Apache Arrow 21               | Format columnar en memoire, passerelle DuckDB/Deck.gl        |
| geoarrow-deck-stream          | Parsing GeoArrow -> buffers binaires Deck.gl (fork custom)   |
| d3-geo + d3-geo-projection    | Projections integrees (Robinson, Natural Earth, etc.)        |
| proj4                         | Projections exotiques, fallback reprojection EPSG:2154/27572 |
| parquet-wasm                  | Lecture GeoParquet cote client                               |
| Paraglide JS 2                | Internationalisation compile-time (FR/EN)                    |
| IndexedDB / localforage       | Persistance locale des projets                               |
| Vitest 4 / Playwright         | Tests unitaires et end-to-end                                |

---

## Principes cles

- **Client-only** : aucune donnee ne quitte le navigateur
- **DuckDB-first** : tout le traitement de donnees via SQL (pas de parsers JS)
- **GPU-first** : rendu via Deck.gl WebGL, pas de GeoJSON JS pour les visualisations
- **Svelte 5 Runes** : `$state`, `$derived`, `$effect`, jamais de stores Svelte 4
