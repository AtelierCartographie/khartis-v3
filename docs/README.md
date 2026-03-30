# Khartis v3 -- Documentation

Khartis est un outil de cartographie thématique open source développé par Sciences Po. Entièrement client-side, il permet de créer des cartes à partir de données tabulaires ou géographiques en trois étapes : **Données**, **Visualisations**, **Habillage**. Aucune donnée ne quitte le navigateur.

---

## Table des matières

### Pour les utilisateurs

| Document | Description |
| --- | --- |
| [Guide utilisateur](GUIDE_UTILISATEUR.md) | Prise en main des 3 étapes, import, visualisation, export |
| [Glossaire](GLOSSAIRE.md) | Définitions des termes cartographiques et techniques |

### Pour les développeurs

| Document | Description |
| --- | --- |
| [Guide développeur](GUIDE_DEVELOPPEUR.md) | Démarrage rapide, règles, tâches courantes |
| [Architecture](ARCHITECTURE.md) | Conception du système, principes, modèles mentaux |
| [Pipeline de données](PIPELINE_DONNEES.md) | Import, validation, traitement, export |
| [Visualisations](VISUALISATIONS.md) | Configuration des cartes thématiques et rendu GPU |
| [Gestion d'état](GESTION_ETAT.md) | Stores, persistance, patterns de features |
| [Fonds de carte](FONDS_DE_CARTE.md) | Préparation, formats et catalogue des fonds de carte |
| [Tests](TESTS.md) | Tests unitaires, intégration et end-to-end |
| [Référence](REFERENCE.md) | Types, utilitaires, raccourcis clavier |
| [PWA](PWA.md) | Progressive Web App, support hors-ligne, cache |

### Contribution et sécurité

- [CONTRIBUTING.md](../CONTRIBUTING.md) -- Guide de contribution
- [SECURITY.md](../SECURITY.md) -- Politique de sécurité

---

## Démarrage rapide

```bash
corepack enable pnpm
pnpm install
pnpm dev
```

Ouvrir [http://localhost:5176/](http://localhost:5176/).

---

## Stack technique

| Technologie | Rôle |
| --- | --- |
| SvelteKit 5 (Runes) | Framework applicatif, rendu réactif |
| TypeScript | Typage statique strict |
| DuckDB WASM | Moteur de requêtes SQL en mémoire, traitement des données |
| Deck.gl 9 | Rendu cartographique GPU (couches thématiques) |
| MapLibre GL 5 | Rendu des fonds de carte (tuiles vectorielles) |
| Carbon Design System | Composants UI (IBM) |
| Apache Arrow | Format columnar en mémoire, passerelle DuckDB/Deck.gl |
| Paraglide | Internationalisation compile-time (FR/EN) |
| IndexedDB / localforage | Persistance locale des projets |
| Vitest / Playwright | Tests unitaires et end-to-end |
