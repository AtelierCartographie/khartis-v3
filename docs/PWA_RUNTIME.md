# Runtime PWA, cache et mise à jour

La PWA de Khartis doit offrir un chargement robuste sans mettre en danger les
projets locaux. Son service worker est une partie du runtime applicatif : une
modification de cache, de chemin de base ou de mise à jour doit être conçue
avec la persistance et les ressources cartographiques, pas comme une simple
optimisation de build.

## Construction et enregistrement

VitePWA construit le service worker à partir de `src/sw.ts` avec une stratégie
`injectManifest`. L'enregistrement est piloté par le composant et le service de
mise à jour de l'application, avec un mode d'inscription demandant une décision
explicite pour une nouvelle version. Le navigateur ne doit donc pas activer une
version nouvelle de façon invisible au milieu d'une session de travail.

Le service worker déduit ses noms de caches et son périmètre de son scope. Cette
isolation évite qu'une installation servie sous un autre chemin de base partage
accidentellement des ressources avec l'application courante. Toute nouvelle
route ou ressource mise en cache doit conserver cette propriété.

## Ce qui est mis en cache

Le pré-cache contient le shell applicatif produit par le build, notamment les
ressources JavaScript, CSS, HTML et le manifeste. Les ressources volumineuses
ou dépendantes du runtime, comme les fonds, les captures, les extensions
DuckDB et les binaires associés, ne font pas toutes partie de ce pré-cache ;
elles sont mises en cache à la demande selon leur catégorie.

| Catégorie                                         | Stratégie de runtime                                          | Effet attendu                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Navigation applicative                            | Réseau d'abord, avec repli sur le shell pré-caché             | Obtenir une version fraîche lorsque le réseau répond, garder une ouverture possible hors ligne |
| Ressources immuables du build                     | Pré-cache et réutilisation contrôlée                          | Charger rapidement l'interface correspondant au build                                          |
| WebAssembly DuckDB, extensions locales et workers | Cache de ressources de runtime                                | Éviter les téléchargements répétés sans prétendre que la première ouverture est hors ligne     |
| Images, polices et préréglages                    | Cache de runtime avec expiration                              | Réutiliser les ressources usuelles sans les rendre éternelles                                  |
| Tuiles vectorielles distantes                     | Cache avec réponse immédiate et actualisation en arrière-plan | Préserver la réactivité tout en renouvelant progressivement les données                        |

Les politiques de cache, leurs clés et leurs durées vivent dans `src/sw.ts`.
Éviter d'ajouter une seconde politique dans un composant ou de s'appuyer sur un
nombre de ressources en cache comme contrat fonctionnel. Les versions obsolètes
sont nettoyées par le service worker dans le périmètre de l'application.

## Mettre à jour sans perdre une session

Une nouvelle version est proposée à l'utilisateur. L'activation anticipée du
service worker n'est autorisée qu'après un message de protocole confirmant que
la persistance a été enregistrée de façon sûre. Cette séquence protège un
projet dont les écritures IndexedDB seraient encore en cours.

Lorsqu'une modification touche la mise à jour :

1. conserver l'invite de mise à jour et le protocole de confirmation ;
2. ne pas appeler `skipWaiting` depuis une vue ou un gestionnaire ad hoc ;
3. tester une session avec des données locales, une version en attente et une
   activation demandée par l'utilisateur ;
4. vérifier le repli de navigation lorsque le réseau est indisponible.

Une mise à jour de cache n'est pas une migration de projet. Les données
persistées restent soumises à leurs schémas et migrations ; consulter
[PROJECT_FORMAT_COMPATIBILITY.md](PROJECT_FORMAT_COMPATIBILITY.md) avant toute
évolution de ce contrat.

## Cache PWA et données utilisateur

Le cache du service worker stocke des réponses HTTP. IndexedDB conserve les
sources et l'état des projets locaux. Ces deux mécanismes ont des durées de vie
et des risques différents : vider un cache PWA n'est pas une méthode de
récupération de données, et effacer les données de site du navigateur peut
supprimer des projets locaux.

Pour diagnostiquer une ressource obsolète, inspecter d'abord le scope du service
worker, la version de l'application, les caches de ce scope et les requêtes
réellement servies. Ne demander un nettoyage manuel de données du navigateur
qu'après sauvegarde ou confirmation explicite de l'utilisateur, et en
expliquant précisément ce qui sera perdu.

## Chemin de base et déploiement

Le chemin de base Vite détermine les URL des ressources, le manifeste, le
scope PWA et la route de navigation pré-cachée. Une construction statique a une
seule URL publique canonique. Les alias d'infrastructure doivent rediriger vers
cette URL au lieu de faire servir le même build sous un autre préfixe.

Pour PPRD et PROD, le script de déploiement déduit ce chemin de l'URL publique
de la cible et le valide. Ne pas remplacer cette valeur par un préfixe manuel
dans le code ou dans le service worker. Les identifiants d'hébergement, chemins
distants et secrets restent hors du dépôt ; la procédure opérationnelle est
dans [DEPLOYMENT.md](DEPLOYMENT.md).

Un test local qui porte sur un chemin de base doit vérifier toutes les URL
résultantes, y compris les ressources de test et le scope du service worker. Il
ne suffit pas qu'une page racine réponde correctement.

## Vérifier un changement PWA

Le développement active le runtime PWA, mais la vérification déterminante se
fait sur un artefact construit :

```sh
pnpm test:pipeline
pnpm build
pnpm preview
```

Dans le navigateur, contrôler au minimum :

- l'inscription du service worker sous le bon scope ;
- le chargement direct d'une route servie sous le chemin de base prévu ;
- le comportement de navigation après une coupure réseau ;
- le chargement d'une ressource DuckDB ou cartographique déjà téléchargée ;
- la proposition puis l'activation d'une mise à jour sans perte de session.

Après un changement de build ou de service worker, repartir d'un état de test
connu. Ne pas conclure à une régression ou à une correction à partir d'un cache
hérité d'une version différente. Les autres validations, notamment la chaîne
CI réellement exécutée, sont précisées dans
[CONTRIBUER_ET_TESTER.md](CONTRIBUER_ET_TESTER.md).

## Signaux de diagnostic

| Symptôme                                    | Vérification prioritaire                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Ancienne interface après publication locale | Scope, version en attente, invite de mise à jour et contenu des caches de ce scope      |
| Ressource introuvable sous un sous-chemin   | Chemin de base du build, URL du manifeste, scope et URL réellement demandée             |
| Première ouverture hors ligne incomplète    | Ressource jamais téléchargée, pré-cache du shell et stratégie de la catégorie concernée |
| Projet local apparemment absent             | IndexedDB et compatibilité de projet avant toute suppression de données de site         |
| Extension DuckDB ou worker indisponible     | Ressource de runtime, en-têtes d'isolation et installation des extensions DuckDB        |
