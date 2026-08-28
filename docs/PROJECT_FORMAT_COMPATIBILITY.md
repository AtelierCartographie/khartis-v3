# Compatibilité du format projet

Ce document est le contrat de compatibilité des projets durables Khartis. Il couvre l'archive `.kh` et le schéma de `project.json`, qui évoluent indépendamment.

Voir aussi : [PERSISTANCE_ET_ARCHIVES.md](PERSISTANCE_ET_ARCHIVES.md).

## Baseline publique actuelle

| Contrat                    | Valeur        | Source de vérité                                            |
| -------------------------- | ------------- | ----------------------------------------------------------- |
| Archive exportée           | v2            | `PROJECT_CONST.ARCHIVE.CURRENT_VERSION`                     |
| Archives lues              | v2 uniquement | `PROJECT_CONST.ARCHIVE.SUPPORTED_VERSIONS`                  |
| Schéma courant et baseline | `3.9.0`       | `PROJECT_CONST.SCHEMA_VERSION` et `SCHEMA_BASELINE_VERSION` |

Les archives v1 et les schémas antérieurs à `3.9.0` appartiennent à la phase de développement et ne sont pas des formats publics supportés. `schemaMigrations` est actuellement vide, ce qui est cohérent tant que la baseline et la version courante sont identiques.

L'import vérifie l'archive et le schéma avant de restaurer les assets. Une version absente, ancienne sans migration, inconnue ou future est rejetée explicitement. Ne jamais restamper silencieusement une version inconnue comme version courante.

## Quand incrémenter quoi

| Changement                                                          | Action                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Structure ZIP, `manifest.json`, chemin ou représentation d'un asset | Incrémenter la version d'archive et conserver un lecteur pour chaque version publique supportée. |
| Structure ou sémantique durable de `project.json`                   | Incrémenter le schéma et ajouter une migration continue.                                         |
| Champ optionnel avec défaut sûr, sans changement de sémantique      | Peut rester dans le schéma courant après revue du comportement de reprise.                       |
| API publique ou extension                                           | Préférer un ajout compatible ou un adaptateur déprécié ; versionner une rupture inévitable.      |

Une archive contient actuellement `manifest.json`, `project.json` et `assets/<assetId>`. Le numéro d'archive ne remplace pas le numéro de schéma : les deux doivent être lus et testés séparément.

## Faire évoluer le schéma

Pour une évolution obligatoire, destructive ou sémantique :

1. incrémenter `SCHEMA_VERSION` ;
2. ajouter dans `schemaMigrations` une migration pure, déterministe, de la version précédente vers la nouvelle ;
3. conserver la chaîne sans trou depuis `SCHEMA_BASELINE_VERSION` ;
4. ne mettre à jour `manifest.version` qu'après succès de la transformation ;
5. ajouter un test du contenu migré, de la continuité de chaîne et de l'échec sur version absente ou future ;
6. vérifier la reprise réelle d'un projet public de chaque version encore supportée.

Une migration doit transformer une copie sémantique du snapshot, sans dépendre d'une table DuckDB de session ni muter son entrée. Les tables DuckDB sont recréées à l'ouverture ; la migration doit donc préserver les informations nécessaires au replay des sources et de l'état métier.

## Faire évoluer l'archive

Pour une évolution du conteneur :

1. incrémenter `ARCHIVE.CURRENT_VERSION` ;
2. conserver v2 et toute autre version publique dans `ARCHIVE.SUPPORTED_VERSIONS` ;
3. ajouter le lecteur ou adaptateur correspondant dans l'importeur ;
4. exporter la nouvelle version sans modifier les lecteurs anciens ;
5. ajouter une fixture réelle pour chaque archive publique lue, plus les cas manifest, asset manquant et version incompatible.

L'import actuel n'est pas atomique à l'échelle complète de l'archive. Une évolution de format ne doit donc pas promettre une restauration tout-ou-rien sans ajouter le mécanisme et les tests qui l'établissent.

## Checklist de revue

- Le changement touche-t-il le conteneur `.kh`, `project.json`, les assets ou seulement un état transitoire ?
- La baseline publique, le lecteur et les migrations restent-ils continus ?
- Le format inconnu est-il refusé sans restamp ni écriture partielle évitable ?
- Les fixtures couvrent-elles chaque version publique et la reprise après import ?
- Les limites connues, notamment la non-atomicité et les quotas navigateur, sont-elles toujours décrites honnêtement ?
