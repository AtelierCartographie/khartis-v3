# Dépannage local

Point d'entrée pour diagnostiquer un problème de façon reproductible. Chaque
document de domaine a son propre tableau de diagnostic, lié en fin de section.

## Réduire le périmètre

1. Noter navigateur, URL, version de l'application et jeu de données. Ne jamais
   joindre à un ticket des données utilisateur ou des secrets.
2. Reproduire si possible avec un jeu de `tests-datasets/`
   ([Contribuer et tester](CONTRIBUER_ET_TESTER.md#jeux-de-données-de-test)).
3. Lancer la vérification la plus étroite : `pnpm check` (types), `pnpm lint`,
   la suite de tests de la zone concernée, ou `pnpm build && pnpm preview` pour
   un problème de distribution.

Les tests client simulent DuckDB : ils ne remplacent pas le parcours réel quand
le Worker, WebGL ou IndexedDB sont en cause.

## DuckDB ne démarre pas

```sh
pnpm download:extensions
pnpm dev
```

Lire ensuite la console : échec de chargement du WASM ou d'une extension. La
correction est d'abord environnementale ; ne pas modifier les lecteurs pour
contourner une extension absente.

DuckDB WASM exige l'isolation cross-origin. `pnpm dev` et `pnpm preview`
envoient les en-têtes `COOP`/`COEP` ; un serveur statique qui les omet empêche
le Worker de démarrer, ce n'est pas un bogue de l'application.

Le premier chargement télécharge le WASM et l'extension spatiale : une attente
initiale n'est pas un blocage.

## Import par URL

`tests-datasets/` n'est servi que par `pnpm dev`
(`http://localhost:5176/tests-datasets/...`). Pour une URL externe, relever le
statut HTTP, le type de contenu et un éventuel blocage CORS avant de suspecter
le pipeline.

## Interface figée

DuckDB WASM et WebGL peuvent saturer (mémoire WASM épuisée sur un gros fichier,
contexte WebGL perdu). Procéder dans l'ordre :

1. **Recharger la page** : le contexte WebGL et le Worker DuckDB sont recréés.
2. **Rechercher une mise à jour** depuis la barre latérale, ou utiliser le
   raccourci Cmd/Ctrl + Alt + R : le runtime PWA est réinitialisé sans toucher
   aux projets ([PWA](PWA_RUNTIME.md)).
3. **Supprimer le projet** depuis la barre latérale, puis le recréer.
4. En dernier recours, **effacer les données du site**. Cette opération
   supprime tous les projets locaux : exporter d'abord ce qui doit être
   conservé.

## Carte vide, lente ou instable

1. Vérifier la prise en charge de WebGL2 ; le canevas de repli ne remplace pas
   le rendu GPU.
2. Identifier le moteur actif : un style de fond tuilé ou OSM active MapLibre.
3. Vérifier que la table Arrow porte les métadonnées GeoArrow.
4. Chercher une recréation inutile de la table ou de la projection : les caches
   dépendent de leur identité.
5. Isoler le worker de parse avec la clé `localStorage`
   `khartis:disable-parse-worker` ; c'est un outil de diagnostic, pas une
   correction.

Voir [Rendu cartographique](RENDU_CARTOGRAPHIQUE.md#diagnostic) et
[Performance et workers](PERFORMANCE_ET_WORKERS.md).

## Journalisation

Les journaux sont actifs en développement. Pour un build local, ces variables
Vite sont disponibles :

| Variable                         | Effet                                       |
| -------------------------------- | ------------------------------------------- |
| `VITE_DEBUG=true`                | active les journaux hors développement      |
| `VITE_LOG_CATEGORIES=...`        | restreint les catégories, ou `all`          |
| `VITE_LOG_LEVEL=WARN` ou `ERROR` | seuil de journalisation (`WARN` par défaut) |
| `VITE_LOG_STACK=true`            | ajoute la pile aux erreurs                  |

Ces valeurs sont compilées dans le build ; le script de déploiement les
neutralise pour PPRD et PROD. Ne jamais journaliser le contenu d'un fichier
importé.

## Problèmes de cache PWA

Une mise à jour enregistre d'abord le projet courant ; si cet enregistrement
échoue, résoudre l'erreur de persistance avant de forcer un rechargement.
Inspecter l'onglet Application du navigateur (service worker, caches,
IndexedDB) sur un build propre. Voir [PWA et runtime](PWA_RUNTIME.md#diagnostic).

## Informations à transmettre

- commande lancée, versions de Node et pnpm ;
- navigateur, système, prise en charge de WebGL2 ;
- messages de console et requêtes réseau pertinents, expurgés des données ;
- étapes de reproduction avec un jeu de données non sensible ;
- résultat du test ciblé ou du build ;
- pour un problème de reprise, les étapes exactes d'ouverture, d'enregistrement
  et de rechargement.
