# Compatibilité du format projet

Ce document définit le contrat de compatibilité des projets Khartis à partir de la première version publique.

## Baseline publique

La première baseline supportée est :

- archive `.kh` version 2 ;
- schéma projet version `3.9.0`.

Les archives version 1 et les schémas `3.0.0` à `3.8.0` appartiennent à la phase de développement. Ils ne sont pas supportés par la version publique.

L'exporteur écrit toujours la version courante. L'importeur valide d'abord la version de l'archive et le schéma du projet, puis restaure les assets. Une version absente, ancienne sans migration ou plus récente que l'application est rejetée explicitement. Elle ne doit jamais être réétiquetée silencieusement comme courante.

## Deux niveaux de version

Le format utilise deux versions indépendantes :

| Version | Source de vérité                        | Quand l'incrémenter                                                                                   |
| ------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Archive | `PROJECT_CONST.ARCHIVE.CURRENT_VERSION` | La structure du conteneur change, par exemple les entrées ZIP, le manifest ou le stockage des assets. |
| Schéma  | `PROJECT_CONST.SCHEMA_VERSION`          | La structure ou la sémantique des données persistées dans `project.json` change.                      |

`PROJECT_CONST.SCHEMA_BASELINE_VERSION` identifie la plus ancienne version publique garantie. `PROJECT_CONST.ARCHIVE.SUPPORTED_VERSIONS` liste les archives que l'importeur sait encore lire.

## Faire évoluer le schéma projet

Une modification additive avec un champ optionnel et un comportement par défaut sûr peut rester dans le schéma courant. Toute modification obligatoire, destructive ou sémantique doit :

1. incrémenter `SCHEMA_VERSION` ;
2. ajouter une migration pure et déterministe dans `schemaMigrations` depuis la version courante précédente ;
3. conserver toutes les migrations publiées depuis `SCHEMA_BASELINE_VERSION` ;
4. ajouter un test du contenu transformé et un test de continuité de la chaîne ;
5. vérifier l'import d'un projet de chaque version publique encore supportée.

Une migration ne modifie pas son entrée. La version du manifest n'est mise à jour qu'après la transformation réussie.

## Faire évoluer l'archive

Une nouvelle version d'archive est réservée à un changement du conteneur, pas à une simple évolution de `project.json`. Lors d'un changement :

1. incrémenter `ARCHIVE.CURRENT_VERSION` ;
2. conserver la version 2 dans `ARCHIVE.SUPPORTED_VERSIONS` ;
3. ajouter le lecteur ou l'adaptateur nécessaire pour les archives publiques précédentes ;
4. tester l'import de chaque version supportée et l'export de la nouvelle version.

## APIs et services

Une API ou un service public utilisé par des extensions, des scripts ou d'autres applications suit la même politique :

- privilégier un ajout rétrocompatible ;
- conserver temporairement un adaptateur et signaler la dépréciation si une signature change ;
- introduire une API versionnée lorsqu'une rupture est inévitable ;
- documenter la durée de support et la procédure de migration avant de retirer l'ancienne API.

## Checklist de revue

- La modification touche-t-elle le conteneur `.kh`, `project.json` ou une API publique ?
- Une version doit-elle être incrémentée ?
- La chaîne de migration reste-t-elle continue depuis `3.9.0` ?
- Toutes les versions publiques d'archive restent-elles lisibles ?
- Les erreurs de versions absentes, anciennes et futures sont-elles explicites ?
- Les tests couvrent-ils le dernier format exporté et chaque format encore supporté ?
