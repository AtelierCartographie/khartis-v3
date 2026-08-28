# Analytics et consentement

> Documentation de maintenance. Le suivi d’usage ne doit jamais modifier la
> promesse centrale de Khartis : les données cartographiques de l’utilisateur
> restent dans son navigateur.

## Responsabilités séparées

| Élément                                   | Responsable                                           |
| ----------------------------------------- | ----------------------------------------------------- |
| Consentement et cookies                   | Cookiebot                                             |
| Chargement du conteneur                   | `analytics.service.ts` avec `PUBLIC_GTM_CONTAINER_ID` |
| Événements propres à Khartis              | `analyticsService`                                    |
| Interface de modification du consentement | `Cookiebot.renew()`                                   |

Khartis observe `Cookiebot.consent.statistics`; il ne conserve pas de second
état de consentement, n’émet pas de commandes Consent Mode et ne gère pas les
cookies d’analytics. Cookiebot reste l’unique source de décision.

## Initialisation

Sans `PUBLIC_GTM_CONTAINER_ID`, aucun fournisseur de suivi n’est chargé. Avec
un identifiant, le service ajoute le script GTM et prépare `dataLayer`. Les
événements Khartis restent bloqués jusqu’à ce que Cookiebot accorde le
consentement statistique.

Le conteneur GTM est une configuration de déploiement. Le helper de déploiement
le reçoit par cible, ce qui permet de désactiver le suivi pour un environnement
en laissant la valeur vide. Ne jamais écrire un identifiant de production en
dur dans le code.

## Contrat de données

Les événements et paramètres sont définis par listes blanches dans
`src/lib/features/commons/services/analytics.service.ts`.

| Événement                    | Paramètres admis                              |
| ---------------------------- | --------------------------------------------- |
| ouverture de l’application   | aucun                                         |
| création ou import de projet | type de source, type de fichier, nombre borné |
| création de visualisation    | type de visualisation                         |
| export                       | cible, format, résolution                     |
| erreur applicative           | source, type d’erreur, caractère fatal        |
| ouverture de projet          | origine locale ou archive                     |

Les valeurs sont normalisées contre des listes finies. Ne jamais ajouter à un
événement un nom de projet, fichier, colonne, lieu, valeur de cellule, contenu
d’annotation, requête SQL ou taille déduite des données de l’utilisateur.

Les URL utilisées pour `page_location` et `page_referrer` sont réduites à
l’origine et au chemin : ni paramètres de recherche ni fragments ne sont
envoyés.

## Ajouter ou modifier un événement

1. Définir l’événement et ses paramètres dans les constantes allow-listées.
2. Définir les domaines de valeurs permis et remplacer toute valeur inconnue
   par une catégorie générique.
3. Vérifier que l’appel est sans effet avant consentement, puis correctement
   mis en file et envoyé après consentement.
4. Ajouter les tests du service et vérifier qu’aucune donnée métier n’entre
   dans `dataLayer`.
5. Mettre à jour ce document et la configuration GTM autorisée si nécessaire.

Un événement qui demande une nouvelle information utilisateur n’est pas une
simple modification technique : il doit être revu avec les responsables de la
confidentialité et de Cookiebot avant d’être publié.

## Vérification locale

- Démarrer avec un identifiant GTM de test, jamais un secret ou une donnée de
  production.
- Vérifier l’absence de script et d’événement lorsque l’identifiant est vide.
- Simuler successivement refus et accord Cookiebot; confirmer que seule la
  seconde situation libère les événements.
- Inspecter `window.dataLayer` en s’assurant que les paramètres restent dans
  le contrat ci-dessus.

Les tests automatisés du service couvrent le chargement conditionnel, le
consentement, les listes blanches et les événements différés. Ils complètent,
mais ne remplacent pas, une vérification de la configuration Cookiebot/GTM sur
l’environnement visé.
