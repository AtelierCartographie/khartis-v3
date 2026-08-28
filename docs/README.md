# Documentation développeur de Khartis

Cette documentation décrit le fonctionnement et l’évolution de Khartis pour
les développeurs. Elle ne remplace ni le code, ni les tests vivants, ni les
contrats de compatibilité.

Khartis est un outil de cartographie thématique qui s’exécute dans le
navigateur. Son architecture combine Svelte 5, DuckDB WASM, Apache Arrow et
GeoArrow, Deck.gl/WebGL, MapLibre et IndexedDB. Le terme à employer est donc
`DuckDB → Arrow/GeoArrow → Deck.gl`, pas « DuckGL ».

## Parcours de prise en main

| Temps          | Lire                                            | Objectif                                               |
| -------------- | ----------------------------------------------- | ------------------------------------------------------ |
| 10 min         | [Contribuer et tester](CONTRIBUER_ET_TESTER.md) | installer le projet et savoir quelle validation lancer |
| 10 min         | [Architecture](ARCHITECTURE.md)                 | comprendre le démarrage et les trois flux majeurs      |
| 15 min         | [Import et DuckDB](IMPORT_DUCKDB.md)            | suivre une donnée jusqu’à Arrow                        |
| 20 min         | [Rendu cartographique](RENDU_CARTOGRAPHIQUE.md) | modifier une carte sans casser le chemin GPU           |
| selon la tâche | les documents de domaine ci-dessous             | intervenir au bon endroit                              |

## Carte de la documentation

| Question                                                             | Document de référence                                             |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Où une action traverse-t-elle les features ?                         | [Architecture](ARCHITECTURE.md)                                   |
| Comment importer, transformer ou joindre des données ?               | [Import et DuckDB](IMPORT_DUCKDB.md)                              |
| Comment le navigateur dessine-t-il une couche ?                      | [Rendu cartographique](RENDU_CARTOGRAPHIQUE.md)                   |
| Comment préparer un fond, une projection ou une jointure ?           | [Fonds et projections](FONDS_PROJECTIONS.md)                      |
| Que reste-t-il après un rechargement ou dans une archive ?           | [Persistance et archives](PERSISTANCE_ET_ARCHIVES.md)             |
| Comment préserver le format public `.kh` ?                           | [Compatibilité du format projet](PROJECT_FORMAT_COMPATIBILITY.md) |
| Comment raisonner sur workers, cache, mémoire et GPU ?               | [Performance et workers](PERFORMANCE_ET_WORKERS.md)               |
| Comment installer, tester et contribuer ?                            | [Contribuer et tester](CONTRIBUER_ET_TESTER.md)                   |
| Comment le PWA fonctionne-t-il à l’exécution ?                       | [PWA et runtime](PWA_RUNTIME.md)                                  |
| Comment diagnostiquer une panne locale ?                             | [Dépannage](DEPANNAGE.md)                                         |
| Comment déployer une release validée ?                               | [Déploiement](DEPLOYMENT.md)                                      |
| Comment maintenir le suivi d’usage sans contourner le consentement ? | [Analytics](ANALYTICS.md)                                         |

## Ce qui fait foi

1. Le code et les tests correspondant au comportement modifié.
2. Les contrats explicitement versionnés, notamment
   [PROJECT_FORMAT_COMPATIBILITY.md](PROJECT_FORMAT_COMPATIBILITY.md).
3. Cette documentation, mise à jour dans le même changement lorsque le contrat
   développeur évolue.

Les fichiers `AGENTS.md`, `CLAUDE.md` et `.claude/rules/` sont des instructions
de contribution utiles, mais ils ne constituent pas l’architecture de référence
pour un lecteur humain. Les répertoires `.ragmir/`, `.agent-plans/` et
`.codex/` ne sont pas des pages de documentation de référence : ils contiennent
des états locaux, des historiques ou des éléments générés.

## Règles de lecture

- Les diagrammes décrivent les frontières stables; les noms de fonctions sont
  des points d’entrée pour retrouver le code, pas une API publique implicite.
- Une limite chiffrée est donnée seulement lorsqu’elle est un comportement
  actuel et utile à la décision. Les tests restent la preuve pour les cas fins.
- Les pages métier expliquent les conséquences techniques. Par exemple,
  polygones, lignes, points, textes et densité sont documentés à poids égal;
  annotations et légendes sont des surcouches, pas des moteurs de rendu.
- Toute modification de persistance, de format ou de comportement navigateur
  doit être vérifiée par un scénario de reprise réel, pas seulement par un
  état de store ou une assertion isolée.
