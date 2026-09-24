# Analytics et consentement

Documentation de maintenance du suivi d'usage. Règle intangible : il ne
transmet jamais rien des données de l'utilisateur, qui restent dans son
navigateur.

## Responsabilités

| Élément                      | Responsable                                                        |
| ---------------------------- | ------------------------------------------------------------------ |
| Consentement et cookies      | Cookiebot                                                          |
| Chargement du conteneur GTM  | `commons/services/analytics.service.ts`, `PUBLIC_GTM_CONTAINER_ID` |
| Événements Khartis           | `analyticsService`                                                 |
| Modification du consentement | `Cookiebot.renew()`                                                |

Khartis lit `Cookiebot.consent.statistics`. Il ne tient pas de second état de
consentement, n'émet pas de commandes Consent Mode et ne gère pas les cookies
d'analytics : Cookiebot est la seule source de décision.

## Initialisation

Sans `PUBLIC_GTM_CONTAINER_ID`, rien n'est chargé. Avec un identifiant, le
service pousse dans `dataLayer` les informations de page (`page_location`,
`page_path`, `page_referrer`, `page_title`), puis charge le script GTM. Les
événements Khartis restent en attente jusqu'au consentement statistique, puis
sont envoyés.

`page_location` et `page_referrer` sont réduits à l'origine et au chemin, sans
paramètres ni fragment ; `page_title` est le nom fixe de l'application.

L'identifiant GTM est une configuration de déploiement, fournie par cible au
script de déploiement ; une valeur vide désactive le suivi pour cette cible. Ne
jamais l'écrire en dur dans le code.

## Événements autorisés

Événements et paramètres sont déclarés par liste blanche
(`ANALYTICS_EVENT`, `ANALYTICS_EVENT_PARAMETERS`) :

| Événement               | Paramètres                                               |
| ----------------------- | -------------------------------------------------------- |
| `app_opened`            | aucun                                                    |
| `project_created`       | `source_type`, `file_type`, `file_count` (plafonné à 10) |
| `data_import_completed` | `source_type`, `file_type`, `file_count` (plafonné à 10) |
| `visualization_created` | `visualization_type`                                     |
| `export_completed`      | `export_target`, `export_format`, `export_resolution`    |
| `app_error`             | `error_source`, `error_type`, `fatal`                    |
| `project_opened`        | `open_source` (projet local ou archive)                  |

Les valeurs appartiennent à des domaines finis ; une partie est normalisée à
l'exécution, le reste (`export_target`, `error_source`, `open_source`) n'est
contraint que par le typage TypeScript. Ne jamais ajouter un nom de projet, de
fichier, de colonne ou de lieu, une valeur de cellule, un texte d'annotation,
une requête SQL ou une taille déduite des données.

## Ajouter ou modifier un événement

1. Déclarer l'événement et ses paramètres dans les listes blanches.
2. Définir le domaine de chaque valeur, et ramener toute valeur inconnue à une
   catégorie générique.
3. Vérifier que l'appel n'émet rien avant consentement, puis qu'il est mis en
   file et envoyé après.
4. Tester le service et vérifier qu'aucune donnée utilisateur n'entre dans
   `dataLayer`.
5. Mettre à jour cette page et la configuration GTM si nécessaire.

Un événement qui demande une nouvelle information sur l'utilisateur doit être
validé par les responsables de la protection des données avant publication.

## Vérification locale

- Utiliser un identifiant GTM de test, jamais celui de production.
- Avec un identifiant vide : ni script, ni événement.
- Refuser puis accepter le consentement Cookiebot : seul l'accord libère les
  événements.
- Inspecter `window.dataLayer` et vérifier que les paramètres respectent le
  tableau ci-dessus.

Les tests du service couvrent chargement conditionnel, consentement, listes
blanches et événements différés. Ils ne dispensent pas de vérifier la
configuration Cookiebot et GTM sur l'environnement visé.
