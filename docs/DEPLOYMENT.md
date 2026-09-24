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

Hors `dry-run`, le script vérifie l'empreinte SSH de l'hôte, dépose le build
dans un répertoire temporaire, puis le met en place par deux renommages
rapides (actuel → précédent, temporaire → actuel). Il conserve les assets
immuables de la release précédente encore nécessaires, puis supprime l'ancienne
arborescence.

Il valide ensuite la route publique canonique sur chaque backend de routage
déclaré. Une redirection permanente (301/308) vers la route canonique est
acceptée ; un autre chemin qui servirait un autre build ne l'est pas.

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
