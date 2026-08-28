# Dépannage local

Ce guide sert à produire un diagnostic reproductible. Il ne remplace pas une
validation navigateur après une modification de rendu, de persistance ou de
PWA.

## Commencer par réduire le périmètre

1. Relever le navigateur, l’URL, la version de l’application et le jeu de
   données utilisé. Ne jamais joindre de données utilisateur ou de secrets au
   ticket.
2. Reproduire sur un jeu de `tests-datasets/` lorsque cela est possible.
3. Lancer le contrôle le plus étroit correspondant à la zone modifiée :

| Symptôme ou modification                  | Première commande            |
| ----------------------------------------- | ---------------------------- |
| Typage, Svelte, import statique           | `pnpm check`                 |
| Formatage ou règles générales             | `pnpm lint`                  |
| Composant, store, utilitaire client       | `pnpm test:unit`             |
| Import, calcul ou persistance de pipeline | `pnpm test:pipeline`         |
| SQL, macro ou intégration moteur          | `pnpm test:duckdb`           |
| Distribution produite                     | `pnpm build && pnpm preview` |

La CI exécute `lint`, `check`, les trois suites de tests et le build. Le fait
que le test client utilise des mocks DuckDB ne dispense pas de tester le
parcours réel quand le Worker, WebGL ou IndexedDB sont concernés.

## Installation ou initialisation DuckDB en échec

Le post-install télécharge les extensions DuckDB WASM nécessaires. Après une
installation interrompue ou un cache réseau défaillant, relancer :

```sh
pnpm download:extensions
pnpm dev
```

Vérifier ensuite la console pour l’échec de chargement de WASM ou d’extension.
Ne pas modifier les importeurs pour contourner une extension absente : la
correction est d’abord environnementale. Les opérations client avec DuckDB
requièrent une isolation cross-origin : le serveur Vite et la prévisualisation
du projet servent les en-têtes `COOP` et `COEP` attendus. Un serveur statique
arbitraire qui les omet peut empêcher le Worker de démarrer.

## Fixtures et import local

`tests-datasets/` est servi par le serveur de développement Vite. Utiliser
`pnpm dev`, puis une URL telle que :

```text
http://localhost:5176/tests-datasets/csv/<fichier>.csv
```

Cette route n’est pas un contrat de l’instance déployée ni de `pnpm preview`.
Pour un import URL, relever également le statut HTTP, le type de contenu et
l’éventuel blocage CORS avant d’accuser le pipeline.

## Carte vide, lente ou instable

1. Confirmer la prise en charge WebGL2 dans le navigateur. Khartis fournit une
   surface de repli orthographique, mais elle ne remplace pas le rendu GPU.
2. Vérifier le moteur actif : Deck.gl orthographique ou MapLibre intercalé.
   Un fond OSM ou une projection compatible tuiles entraîne le second mode.
3. Vérifier que la table Arrow porte bien les métadonnées GeoArrow requises.
   Une table sans géométrie ne peut pas produire une couche utilisateur.
4. Chercher une recréation inutile de la table Arrow ou de l’objet projection :
   les caches de parse et de projection dépendent de leur identité.
5. Pour les grandes géométries, vérifier le Worker de parse. Après son timeout,
   Khartis bascule sur le thread principal pour la session. Le stockage local
   `khartis:disable-parse-worker` permet d’isoler ce facteur lors d’un
   diagnostic, pas de corriger durablement une régression.

Consulter [Rendu cartographique](RENDU_CARTOGRAPHIQUE.md) et
[Performance et workers](PERFORMANCE_ET_WORKERS.md) avant de modifier une
factory, une couche ou un cache.

## Journalisation de développement

La journalisation est active en développement. Pour une build locale précise,
les variables Vite suivantes sont disponibles :

| Variable                                        | Effet                                     |
| ----------------------------------------------- | ----------------------------------------- |
| `VITE_DEBUG=true`                               | active les logs hors mode développement   |
| `VITE_LOG_CATEGORIES=...`                       | limite les catégories, ou `all`           |
| `VITE_LOG_LEVEL=WARN` ou `VITE_LOG_LEVEL=ERROR` | définit le seuil                          |
| `VITE_LOG_STACK=true`                           | ajoute les piles aux erreurs journalisées |

Ces valeurs sont compilées dans la build. Ne pas les définir dans une build
publique de production ni consigner le contenu d’un fichier importé.

## PWA, cache et état local

Une mise à jour PWA tente de sauvegarder le projet courant avant activation. Si
la sauvegarde échoue, résoudre d’abord l’erreur de persistance plutôt que de
forcer le rechargement.

Pour un problème de cache :

1. Reproduire avec une build propre et vérifier l’onglet Application du
   navigateur : service worker, cache et IndexedDB.
2. Utiliser le mécanisme de mise à jour ou de nettoyage proposé par
   l’application lorsque le problème est lié à Khartis.
3. Avant d’effacer manuellement les données du site, exporter le projet ou
   confirmer qu’aucune donnée locale à conserver n’existe. Cette opération est
   destructrice pour les projets et assets IndexedDB du navigateur.

Voir [PWA et runtime](PWA_RUNTIME.md) et
[Persistance et archives](PERSISTANCE_ET_ARCHIVES.md).

## Informations minimales à transmettre

- commande et version Node/pnpm;
- navigateur, plateforme et support WebGL2;
- messages console et requêtes réseau pertinents, expurgés des données;
- chemin de reproduction avec une fixture non sensible;
- résultat du test ciblé ou de la build;
- pour une reprise de projet, les étapes exactes d’ouverture, de sauvegarde et
  de rechargement.
