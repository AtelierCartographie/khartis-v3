# Performance, workers et caches

Khartis traite dans le navigateur des données géographiques parfois
volumineuses. Sa performance tient moins à des optimisations locales qu'à la
continuité d'un chemin binaire : DuckDB, Arrow, GeoArrow, puis Deck.gl. Cette
page décrit les workers, les caches et la façon de mesurer un changement.

## Workers

| Worker         | Rôle                                                   | Cycle de vie                                                               |
| -------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| DuckDB WASM    | toutes les requêtes SQL, en mono-thread                | initialisé une fois et partagé ; terminé et réinitialisable en cas d'échec |
| Parse GeoArrow | projection et conversion binaire hors du fil principal | créé à la demande ; désactivé pour la session après un échec ou un timeout |

La configuration de DuckDB (bundle, limite mémoire, extensions) est décrite
dans [Import et DuckDB](IMPORT_DUCKDB.md#démarrage-du-moteur). La limite
mémoire dépend de l'appareil : ne pas la remplacer par une constante pour
régler un cas local ; réduire plutôt les colonnes, les tables intermédiaires et
les copies.

Une requête DuckDB lourde ne s'interrompt pas : le Worker ne rend la main
qu'une fois le calcul terminé.

### Worker de parse

`geoarrow-stream-bridge.utils.ts` délègue le parse au worker
(`worker-parse.svelte.ts`) quand :

- la table a au moins 2 000 lignes (`WORKER_PARSE_MIN_ROWS`) ;
- la projection est sérialisable et enregistrée par `registerProjectionSpec`.

Sinon, le parse est synchrone. Pendant un parse en worker, la couche reçoit un
résultat vide provisoire, puis une mise à jour réactive (incrément de version)
quand le résultat arrive.

Après 30 s sans réponse ou un plantage, le worker est désactivé pour la session
et le parse repasse sur le fil principal ; les échecs sont mémorisés par couple
table/projection. Pour isoler ce facteur lors d'un diagnostic, la clé
`localStorage` `khartis:disable-parse-worker` désactive le worker.

## Caches

Les caches de calcul sont indexés sur l'**identité** des objets Arrow et
projection (`WeakMap`) : cloner une table inchangée ou recréer une projection
équivalente les invalide et refait le travail à chaque rendu.

| Cache                      | Taille                  | Emplacement                                  |
| -------------------------- | ----------------------- | -------------------------------------------- |
| Données binaires projetées | 2 projections par table | `map/utils/geoarrow-stream-bridge.utils.ts`  |
| Tables Arrow jointes       | 4 entrées               | `duckdb/orchestrator/orchestrator.svelte.ts` |
| Gradings de jointure       | 4 entrées               | `duckdb/orchestrator/join-ops.ts`            |
| Résultats de densité       | 12 entrées              | `duckdb/orchestrator/density-ops.ts`         |
| Bornes de classification   | 50 entrées              | `commons/services/classification.service.ts` |

Ces caches ne se purgent pas depuis une vue pour « réparer » une carte : on
corrige l'identité des données ou l'invalidation à la source.

Trois mécanismes à ne pas confondre :

| Mécanisme               | Finalité                                                                 | Ne pas l'utiliser pour         |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------ |
| Caches de calcul        | ne pas reprojeter ou resérialiser une table inchangée                    | stocker un état durable        |
| Cache du service worker | réutiliser les ressources téléchargées ([PWA](PWA_RUNTIME.md))           | stocker un projet ou un calcul |
| IndexedDB               | conserver sources et projets ([persistance](PERSISTANCE_ET_ARCHIVES.md)) | mettre en cache un résultat    |

## Règles du chemin de rendu

- Filtrer, projeter et transformer dans DuckDB.
- Transmettre les tables Arrow et leurs buffers tels quels jusqu'aux factories.
- Garder la même référence de table et de projection tant que les données ne
  changent pas ; ne pas reconstruire des structures équivalentes à chaque
  réaction Svelte.
- Isoler et justifier, mesure à l'appui, tout passage temporaire par GeoJSON ou
  des objets JavaScript.
- Charger les jeux de données séquentiellement (`loadDatasetsSequentially`),
  pour limiter les pics de mémoire.
- Construire de nouvelles instances de couches Deck.gl plutôt que de muter une
  couche déjà rendue.
- Toute ressource créée hors du cycle de vie de `useMapInit` (observateur,
  overlay, canevas) a une libération symétrique.

## Mesurer

Mesurer sur un scénario représentatif, pas sur un petit fichier artificiel :
un jeu de données, un style et une interaction qui exercent la zone modifiée.
Comparer avant et après, en changeant une seule variable à la fois :

1. délai entre l'action et un affichage exploitable ;
2. activité du fil principal et des workers ;
3. mémoire, nombre de canevas et de workers actifs ;
4. fluidité pendant les déplacements et changements de couche.

Outils disponibles :

- le panneau Performance du navigateur ;
- les marques de performance (`commons/utils/perf-marks.utils.ts`) ;
- en développement et en préproduction, le débogage Deck.gl
  (`map/stores/deck-debug.store.svelte.ts`), qui expose `window.__deck` et
  `window.__maplibreMap`.

Les variables `VITE_*` de diagnostic sont compilées dans le code client : ne
jamais y mettre d'information sensible.

## Vérifier

Les tests client (jsdom) ne valident ni un contexte GPU réel ni les contraintes
mémoire d'un navigateur. Pour un changement de worker, de projection, de couche
ou de cycle de vie, compléter `pnpm test:unit` et `pnpm build` par un parcours
dans `pnpm dev` avec plusieurs jeux de `tests-datasets/`, dont un qui force un
changement de moteur ou de projection. Vérifier qu'entrer puis sortir de la vue
ne laisse ni canevas, ni carte, ni worker résiduel.

Checklist :

- DuckDB, Arrow et le chemin binaire sont-ils conservés ?
- Les données inchangées gardent-elles la même identité entre deux rendus ?
- Workers, observateurs et ressources WebGL sont-ils libérés symétriquement ?
- L'absence de WebGL2 et l'échec du worker suivent-ils le repli prévu ?
- La mesure a-t-elle été faite sur une donnée et une interaction
  représentatives ?
