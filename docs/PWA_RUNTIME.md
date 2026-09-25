# Runtime PWA, cache et mise à jour

Le service worker de Khartis fait partie du runtime : il doit charger
l'application de façon fiable sans jamais mettre en danger les projets locaux.
Toute modification de cache, de chemin de base ou de mise à jour se conçoit
avec la persistance ([Persistance et archives](PERSISTANCE_ET_ARCHIVES.md)).

## Construction et enregistrement

- VitePWA construit `src/sw.ts` en stratégie `injectManifest`.
- `registerType: 'prompt'`, `injectRegister: false` : l'enregistrement est fait
  par `pwa-service-worker.svelte` (`useRegisterSW`), qui vérifie les mises à
  jour toutes les heures. Une nouvelle version n'est jamais activée sans
  décision de l'utilisateur.
- Les noms de caches sont dérivés du scope du service worker : une
  installation servie sous un autre chemin de base ne partage pas ses caches.
- En production, le composant demande le stockage persistant
  (`navigator.storage.persist()`).
- **En développement, le service worker est désinscrit et ses caches
  supprimés** : la vérification d'un changement PWA se fait sur un build.

## Stratégies de cache

Le précache contient le shell produit par le build (JS, CSS, HTML, manifeste)
ainsi que les métadonnées du catalogue de fonds et les préréglages de
projections et de styles. Le reste est mis en cache à l'usage :

| Ressources                                                | Stratégie                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| Navigation                                                | réseau d'abord (timeout 10 s), repli sur le shell précaché du scope |
| Assets immuables du build                                 | précache, avec un instantané de la version précédente en secours    |
| WASM DuckDB, extensions (locales ou CDN), workers         | cache d'abord, avec expiration                                      |
| Images et polices                                         | cache d'abord, vidé à chaque activation d'une nouvelle version      |
| Tuiles vectorielles IGN (`data.geopf.fr`) et OpenMapTiles | réponse du cache puis actualisation en arrière-plan                 |
| `/_app/version.json`, `/sw.js`                            | jamais mis en cache                                                 |

Les politiques, clés et durées vivent dans `src/sw.ts` et nulle part ailleurs.
Les caches obsolètes du scope sont supprimés à l'activation. La première
ouverture hors ligne d'une ressource jamais téléchargée n'est pas possible.

## Mise à jour sans perte de session

L'activation d'une nouvelle version (`skipWaiting`) n'a lieu qu'à réception du
message `{ type: 'SKIP_WAITING', protocolVersion: 1, persistenceFlushed: true }`,
envoyé une fois la persistance du projet confirmée. Aucune vue ne doit appeler
`skipWaiting` elle-même.

Le bouton « Rechercher une mise à jour » de la barre latérale
(`runFullUpdateFlow`) enchaîne : vérification, installation d'une version en
attente, sinon réinitialisation du runtime (désinscription du service worker,
suppression des caches du scope) et rechargement. IndexedDB n'est pas touché :
le projet ouvert est conservé. Le bouton débloque aussi un client coincé par
une mise à jour défectueuse. Il s'arrête sans recharger si le navigateur est
hors ligne ou si l'enregistrement du projet n'est pas confirmé.

Deux mécanismes de secours, qui ne touchent pas non plus à IndexedDB :

- le raccourci **Cmd/Ctrl + Alt + R** désinscrit le service worker, vide les
  caches du scope puis recharge avec `?reset=1` ;
- `?reset=1` seul ne vide rien : il saute seulement la restauration du dernier
  projet.

Une mise à jour de cache n'est pas une migration de projet : les données
persistées suivent leur schéma
([Compatibilité du format projet](PROJECT_FORMAT_COMPATIBILITY.md)).

## Cache PWA et données utilisateur

Le service worker stocke des réponses HTTP ; IndexedDB stocke sources et
projets. Vider un cache PWA ne récupère pas de données, mais effacer les
données de site du navigateur supprime les projets locaux. Ne proposer ce
nettoyage qu'après un export `.kh` ou la confirmation qu'aucun projet n'est à
conserver.

## Chemin de base

Le chemin de base Vite (`BASE_PATH`) détermine les URL des ressources, le
manifeste, le scope et la route de navigation précachée. Un build n'a qu'une
URL publique canonique ; les alias d'infrastructure redirigent vers elle au lieu
de servir le même build sous un autre préfixe.

Pour PPRD et PROD, le script de déploiement dérive `BASE_PATH` de l'URL publique
de la cible ([Déploiement](DEPLOYMENT.md)). Ne jamais le coder en dur dans
l'application ou le service worker.

## Vérifier un changement PWA

```sh
pnpm test:pipeline
pnpm build
pnpm preview
```

Contrôler ensuite dans le navigateur :

- l'enregistrement du service worker sous le bon scope ;
- le chargement direct d'une route sous le chemin de base prévu ;
- la navigation après une coupure réseau ;
- le chargement d'une ressource DuckDB ou cartographique déjà téléchargée ;
- la proposition puis l'activation d'une mise à jour sans perte de session.

Repartir d'un état connu après chaque changement de build : un cache hérité
d'une autre version fausse la conclusion.

## Diagnostic

| Symptôme                                  | Vérifier                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| Ancienne interface après publication      | scope, version en attente, invite de mise à jour, caches du scope          |
| Ressource introuvable sous un sous-chemin | `BASE_PATH` du build, URL du manifeste, scope, URL réellement demandée     |
| Ouverture hors ligne incomplète           | ressource jamais téléchargée, précache du shell, stratégie de la catégorie |
| Projet local apparemment absent           | IndexedDB et compatibilité du projet, avant toute suppression de données   |
| Extension DuckDB ou worker indisponible   | cache de runtime, en-têtes d'isolation, installation des extensions        |
