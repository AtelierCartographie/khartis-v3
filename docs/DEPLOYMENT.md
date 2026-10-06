# Déploiement

> Réservé aux mainteneurs habilités. Cette page décrit le mécanisme et ses
> garde-fous, jamais les hôtes, chemins distants, identifiants ou secrets.

Khartis est un site statique. Le script local `scripts/deploy-local.mjs` ne
déploie qu'une release déjà produite par GitHub Actions (`release.yml`) :

| Cible | Tag déployé                                                         | Branche   |
| ----- | ------------------------------------------------------------------- | --------- |
| PPRD  | dernière prérelease `vX.Y.Z-pprd.N` (anciens `-staging.N` acceptés) | `staging` |
| PROD  | dernière release stable `vX.Y.Z`                                    | `main`    |

## Commandes

```sh
pnpm deploy:pprd:dry-run
pnpm deploy:pprd
pnpm deploy:prod:dry-run
pnpm deploy:prod
```

`--tag <tag>` déploie une release précise. Le script accepte aussi les alias
`staging` et `production`. Un `dry-run` vérifie la release, la CI et le build
sans connexion SFTP ; il a besoin de l'URL publique de la cible, qui détermine
le `BASE_PATH` du build.

## Prérequis

- Node.js et pnpm, avec les dépendances du dépôt installées ;
- `git` et GitHub CLI (`gh auth status`), avec un compte autorisé à lire
  releases et workflows ;
- la configuration dans un fichier ignoré (`.env` ou `.env.deploy.local`) ou
  dans l'environnement du shell, jamais dans le dépôt.

Variables attendues (les noms figurent dans `.env.example`, l'aide du script
les détaille) :

| Groupe                | Variables                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connexion SFTP        | `KHARTIS_SFTP_HOST`, `KHARTIS_SFTP_HOST_FINGERPRINT_SHA256`, `KHARTIS_SFTP_USER`, et `KHARTIS_SFTP_PASSWORD` ou `KHARTIS_SFTP_PRIVATE_KEY_PATH`            |
| Par cible             | `KHARTIS_PUBLIC_URL_<CIBLE>`, `KHARTIS_SFTP_REMOTE_DIR_<CIBLE>`, `KHARTIS_GTM_CONTAINER_ID_<CIBLE>` (vide = sans analytics)                                |
| Validation du routage | `KHARTIS_HTTP_ROUTING_COOKIE_NAME`, `KHARTIS_HTTP_ROUTING_BACKENDS_<CIBLE>` (obligatoires hors `dry-run`), `KHARTIS_HTTP_BACKEND_HEADER_NAME` (facultatif) |
| Facultatif            | `KHARTIS_SFTP_PORT`, `KHARTIS_SFTP_PASSPHRASE`                                                                                                             |

## Ce que le script vérifie avant tout transfert

1. Il récupère les tags distants et choisit le dernier tag du canal, ou celui
   de `--tag`.
2. Il vérifie que les tags local et distant désignent le même commit.
3. Il exige un run `release.yml` réussi pour ce commit et la branche attendue.
4. Il dérive `BASE_PATH` de l'URL publique, pour que assets et service worker
   soient construits pour la route réellement exposée.
5. Il construit dans une copie temporaire, avec `pnpm install --frozen-lockfile`
   et une journalisation de production.

## Transfert et publication

Hors `dry-run`, le script vérifie l'empreinte SSH de l'hôte, prend un verrou
sur la cible, puis enchaîne :

1. **Dépôt dans un répertoire temporaire.** Seuls les fichiers modifiés sont
   envoyés. Chaque build embarque un manifeste `.khartis-release-files.json`
   (chemin et empreinte SHA-256 de chaque fichier) ; les fichiers dont
   l'empreinte n'a pas changé sont repris de la version en ligne par lien
   physique côté serveur (extension SFTP `hardlink@openssh.com`), sans
   transiter par le poste. Si la version en ligne n'a pas encore ce manifeste,
   le script reconnaît quand même les assets à nom haché (leur nom change avec
   leur contenu) et les fichiers de `static/` dont le blob git est identique
   entre le tag en ligne et le tag déployé.
2. **Conservation des assets immuables de la version précédente**, repris par
   lien de la même façon : un onglet resté sur l'ancienne version continue de
   charger ses chunks.
3. **Publication des nouveaux assets immuables à côté de la version en
   ligne**, puis attente qu'ils soient servis par chaque backend de routage
   déclaré. Ce sont des fichiers à nom haché que rien ne référence encore : la
   version en ligne n'en est pas affectée.
4. **Bascule** par deux renommages rapides (actuel → précédent, temporaire →
   actuel).
5. **Validation de la route publique** sur chaque backend, puis suppression de
   l'ancienne arborescence par lots en parallèle.

Si le serveur refuse les liens, le script renvoie tout et publie les nouveaux
assets avec la bascule, comme avant : c'est plus long, jamais bloquant. Si un
backend ne sert toujours pas les nouveaux assets après environ 2 min 30, le
déploiement s'arrête avant la bascule et la version en ligne reste intacte.

Ordre de grandeur mesuré sur la PPRD avant ce mécanisme : 1 h 28, dont 34 min
de transfert pour 442 Mo, 39 min de recopie des anciens assets et 15 min de
suppression de l'ancienne arborescence. Le premier déploiement d'une cible
après ce changement renvoie encore les fichiers que le bootstrap ne reconnaît
pas ; les suivants n'envoient que ce qui a changé.

Une redirection permanente (301/308) vers la route canonique est acceptée ; un
autre chemin qui servirait un autre build ne l'est pas.

## Mise à jour PWA pendant un déploiement

La PWA ne bascule jamais d'elle-même : un nouveau `sw.js` s'installe, précache
les nouveaux assets puis attend l'accord de l'utilisateur
([Runtime PWA](PWA_RUNTIME.md)). Le déploiement garantit donc deux choses :

- **Un nouveau point d'entrée ne précède jamais ses assets.** `index.html` et
  `sw.js` ne changent qu'à la bascule, une fois les nouveaux assets servis par
  chaque backend (étape 3). Sans cela, pendant la propagation vers les backends,
  un navigateur pourrait recevoir le nouveau HTML et un 404 pour ses chunks.
- **Un ancien onglet garde ses assets.** Les assets immuables de la version
  précédente restent servis (étape 2), en plus de l'instantané que garde le
  service worker.

L'installation du nouveau service worker télécharge les entrées précachées en
`cache: 'reload'` (Workbox), donc sans passer par le cache HTTP du navigateur.

Le cycle complet a été rejoué localement le 3 octobre 2026 (serveur OpenSSH,
serveur web reproduisant les en-têtes de l'hébergement, propagation différée vers un
backend) : version A en ligne avec un projet ouvert, déploiement de B (1 555
fichiers sur 1 599 repris par lien), invite de mise à jour, activation : B
chargée, projet conservé, aucun 404 côté navigateur, assets de A toujours
servis.

## En-têtes attendus de l'hébergement

La mise à jour PWA suppose ces réponses, que la validation publique du script
contrôle :

- `index.html`, `sw.js`, `_app/version.json` et `manifest.webmanifest` en
  `no-store` ;
- les assets sous `_app/immutable/` en cache long et `immutable`, pour les
  seules réponses 200 : une erreur reste en `no-store`, sinon un navigateur
  garderait en échec un asset pas encore propagé ;
- le WASM servi compressé (gzip ou Brotli) ;
- un fond de carte modifié change de nom (année ou version), car les fonds
  sont mis en cache plusieurs semaines.

La PROD demande de ressaisir le tag, même avec `--yes`. Cette confirmation ne
se contourne pas.

## Déroulé recommandé

1. Lancer le `dry-run` de la cible.
2. Résoudre toute divergence de tag, de CI ou de build avant la fenêtre de
   déploiement.
3. Vérifier la configuration locale sans afficher les valeurs dans un ticket ou
   un terminal partagé.
4. Lancer le déploiement, et confirmer le tag pour la PROD.
5. Lire la sortie complète, puis ouvrir la route publique : chargement,
   navigation sous le bon `BASE_PATH`, assets immuables.

## Cas exceptionnels

- `--migrate-legacy-assets` : uniquement pour le premier déploiement depuis une
  release sans manifeste `.khartis-release-assets.json`.
- `--recover-stale-lock` : uniquement après avoir vérifié qu'aucun autre
  déploiement n'est en cours.

Le script ne fait pas de rollback. En cas d'échec après transfert ou d'état
distant inattendu, conserver la sortie, cesser les tentatives et suivre la
procédure d'exploitation convenue entre mainteneurs.

## Modifier le script

- Conserver la confirmation du tag PROD.
- Ne court-circuiter ni la CI de release, ni la vérification d'empreinte, ni la
  validation publique.
- N'introduire aucun hôte, chemin ou identifiant réel dans le dépôt.
- Conserver le lien entre `KHARTIS_PUBLIC_URL_*`, `BASE_PATH` et la route
  publiée.
- Tester au minimum les deux `dry-run`.
