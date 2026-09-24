# Documentation développeur de Khartis

Fonctionnement interne et règles d'évolution de Khartis, outil de cartographie
thématique exécuté entièrement dans le navigateur (Svelte 5, DuckDB WASM,
Apache Arrow et GeoArrow, Deck.gl, MapLibre, IndexedDB).

Pour installer le projet et proposer une modification, commencer par
[CONTRIBUTING.md](../CONTRIBUTING.md). Le mode d'emploi pour les utilisateurs
est publié sur le
[site de l'Atelier](https://www.sciencespo.fr/cartographie/fr/outils/khartis/mode-emploi).

## Par où commencer

1. [Architecture](ARCHITECTURE.md) : démarrage, trois flux de données, deux
   moteurs de rendu.
2. [Import et DuckDB](IMPORT_DUCKDB.md) : d'un fichier à une table Arrow.
3. [Rendu cartographique](RENDU_CARTOGRAPHIQUE.md) : d'une table Arrow au GPU.
4. Le document du domaine concerné, ci-dessous.

## Documents

| Question                                                       | Document                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| Comment une action traverse-t-elle les features ?              | [Architecture](ARCHITECTURE.md)                                   |
| Comment importer, transformer ou joindre des données ?         | [Import et DuckDB](IMPORT_DUCKDB.md)                              |
| Comment une couche est-elle dessinée ?                         | [Rendu cartographique](RENDU_CARTOGRAPHIQUE.md)                   |
| Comment discrétiser, colorer ou tramer une variable ?          | [Discrétisation et couleurs](DISCRETISATION_ET_COULEURS.md)       |
| Comment fonctionnent fonds, jointures et projections ?         | [Fonds et projections](FONDS_PROJECTIONS.md)                      |
| Que devient un projet au rechargement ou dans une archive ?    | [Persistance et archives](PERSISTANCE_ET_ARCHIVES.md)             |
| Comment faire évoluer le format `.kh` sans casser l'existant ? | [Compatibilité du format projet](PROJECT_FORMAT_COMPATIBILITY.md) |
| Workers, caches, mémoire : comment mesurer ?                   | [Performance et workers](PERFORMANCE_ET_WORKERS.md)               |
| Quels tests, jeux de données et contrôles CI ?                 | [Contribuer et tester](CONTRIBUER_ET_TESTER.md)                   |
| Comment le service worker met-il en cache et à jour ?          | [PWA et runtime](PWA_RUNTIME.md)                                  |
| Comment diagnostiquer un problème local ?                      | [Dépannage](DEPANNAGE.md)                                         |
| Comment le suivi d'usage respecte-t-il le consentement ?       | [Analytics](ANALYTICS.md)                                         |
| Comment déployer une release ?                                 | [Déploiement](DEPLOYMENT.md)                                      |

## Ce qui fait foi

1. Le code et ses tests.
2. Les contrats versionnés, en premier lieu
   [la compatibilité du format projet](PROJECT_FORMAT_COMPATIBILITY.md).
3. Cette documentation, mise à jour dans le même changement que le contrat
   qu'elle décrit.

Les noms de fonctions et de fichiers cités servent à retrouver le code ; ils ne
constituent pas une API publique. `CLAUDE.md`, `AGENTS.md` et `.claude/rules/`
sont des consignes pour les assistants de code, pas une documentation de
référence.
