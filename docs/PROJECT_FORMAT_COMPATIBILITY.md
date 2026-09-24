# Compatibilité du format projet

Contrat de compatibilité des projets Khartis. Il porte sur deux versions qui
évoluent indépendamment : celle du conteneur `.kh` et celle du schéma de
`project.json`. Le fonctionnement de la persistance est décrit dans
[Persistance et archives](PERSISTANCE_ET_ARCHIVES.md).

## Baseline publique

| Contrat          | Valeur  | Source de vérité                                            |
| ---------------- | ------- | ----------------------------------------------------------- |
| Archive exportée | v2      | `PROJECT_CONST.ARCHIVE.CURRENT_VERSION`                     |
| Archives lues    | v2      | `PROJECT_CONST.ARCHIVE.SUPPORTED_VERSIONS`                  |
| Schéma de projet | `3.9.0` | `PROJECT_CONST.SCHEMA_VERSION` et `SCHEMA_BASELINE_VERSION` |

Les archives v1 et les schémas antérieurs à `3.9.0` datent du développement et
ne sont pas supportés. `schemaMigrations` est vide tant que la version courante
est la baseline.

Avant toute restauration d'asset, l'import rejette explicitement une version
absente, inconnue, future, ou ancienne sans migration. Une version inconnue
n'est jamais réétiquetée silencieusement comme version courante.

## Quoi incrémenter

| Changement                                                           | Action                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Structure du ZIP, `manifest.json`, chemin ou forme d'un asset        | incrémenter la version d'archive, garder un lecteur par version publique             |
| Structure ou sémantique durable de `project.json`                    | incrémenter le schéma, ajouter une migration continue                                |
| Champ optionnel avec valeur par défaut sûre, sans changement de sens | possible dans le schéma courant, après revue de la reprise                           |
| API publique                                                         | ajout compatible ou adaptateur déprécié ; version dédiée pour une rupture inévitable |

## Faire évoluer le schéma

1. Incrémenter `SCHEMA_VERSION`.
2. Ajouter à `schemaMigrations` une migration pure et déterministe de la version
   précédente vers la nouvelle.
3. Garder la chaîne continue depuis `SCHEMA_BASELINE_VERSION`.
4. Ne mettre à jour `manifest.version` qu'après succès de la migration.
5. Tester le contenu migré, la continuité de la chaîne et le rejet d'une
   version absente ou future.
6. Vérifier la reprise réelle d'un projet de chaque version publique.

Une migration transforme une copie du snapshot, sans muter son entrée ni
dépendre d'une table DuckDB. Elle doit préserver tout ce dont le réimport des
sources et la restauration de l'état ont besoin.

## Faire évoluer l'archive

1. Incrémenter `ARCHIVE.CURRENT_VERSION`.
2. Garder v2 et toute autre version publique dans `ARCHIVE.SUPPORTED_VERSIONS`.
3. Ajouter le lecteur ou l'adaptateur correspondant dans l'importeur.
4. Exporter la nouvelle version sans modifier les lecteurs existants.
5. Ajouter une archive de test réelle par version publique lue, plus les cas
   manifest invalide, asset manquant et version incompatible.

L'import n'est pas atomique : une évolution de format ne promet pas une
restauration tout-ou-rien sans ajouter le mécanisme et les tests qui
l'établissent.

## Checklist de revue

- Le changement touche-t-il le conteneur, `project.json`, les assets, ou
  seulement un état transitoire ?
- Baseline, lecteurs et migrations restent-ils continus ?
- Une version inconnue est-elle refusée sans réétiquetage ni écriture partielle
  évitable ?
- Les archives de test couvrent-elles chaque version publique et la reprise
  après import ?
- Les limites connues (non-atomicité, quotas) sont-elles toujours décrites ?
