# Déploiement local versionné

> Réservé aux mainteneurs habilités. Ce document décrit le mécanisme et ses
> garde-fous, jamais les hôtes, chemins distants, identifiants ou secrets.

Khartis est livré comme site statique. Le script local déploie uniquement une
release déjà produite par GitHub Actions : une prérelease PPRD depuis
`staging`, ou une release stable PROD depuis `main`.

## Commandes

```sh
pnpm deploy:pprd:dry-run
pnpm deploy:pprd
pnpm deploy:prod:dry-run
pnpm deploy:prod
```

Les alias de cible `staging` et `production` sont acceptés par le script, mais
la documentation utilise `pprd` et `prod` afin de distinguer clairement les
environnements.

Un `dry-run` vérifie la release, la CI et le build sans connexion SFTP. Il a
toujours besoin de l’URL publique cible car celle-ci détermine le `BASE_PATH`
du build.

## Prérequis locaux

- Node 22 et pnpm, avec les dépendances du dépôt disponibles;
- `git` et GitHub CLI `gh`, connecté au compte autorisé à lire les releases et
  workflows;
- le dépôt contenant le tag à déployer;
- un fichier local ignoré (`.env` ou `.env.deploy.local`) ou des variables de
  session, jamais une valeur versionnée.

Vérifier l’accès GitHub avant une fenêtre de déploiement :

```sh
gh auth status
```

Le script attend les variables partagées de connexion SFTP, l’empreinte du
serveur et, pour chaque cible, l’URL publique, le répertoire distant et,
éventuellement, l’identifiant GTM. Les noms exacts sont affichés par l’aide du
script et figurent dans `.env.example`; les valeurs réelles restent locales.

## Ce que le script prouve avant un transfert

1. Il récupère les tags distants et sélectionne le dernier tag du canal, ou le
   tag passé avec `--tag`.
2. Il vérifie que le tag local et le tag distant désignent le même commit.
3. Il exige un workflow `release.yml` vert pour le commit et la branche de
   release attendue.
4. Il dérive le `BASE_PATH` de l’URL publique cible afin que les assets et le
   service worker soient construits sur la route réellement exposée.
5. Il construit dans une copie temporaire avec `pnpm install --frozen-lockfile`.

La PPRD attend un tag `vX.Y.Z-pprd.N` (les anciens tags `-staging.N` restent
acceptés). La PROD attend un tag stable `vX.Y.Z`.

## Garde-fous de transfert et de publication

Hors `dry-run`, le script vérifie l’empreinte de l’hôte SFTP, dépose le build
dans un répertoire temporaire, puis effectue un basculement atomique par
renommage. Il conserve les assets immuables requis par la release précédente
avant de supprimer l’ancienne arborescence.

Après le basculement, il valide la route publique canonique et, si elle est
configurée, chaque backend de routage. Une redirection permanente vers la
route canonique est autorisée, mais une variante de chemin qui sert un autre
build ne l’est pas.

La PROD demande la ressaisie du tag, y compris lorsque `--yes` est fourni.
Cette confirmation ne doit pas être contournée.

## Flux recommandé

1. Lancer le `dry-run` de la cible.
2. Résoudre toute divergence de tag, CI ou build avant la fenêtre.
3. Vérifier la configuration locale et les variables sans les afficher dans un
   ticket ou un terminal partagé.
4. Lancer la commande de déploiement et répondre à la confirmation PROD le cas
   échéant.
5. Lire le résultat complet du script, puis ouvrir la route publique canonique
   et vérifier le chargement, la navigation sous le bon `BASE_PATH` et les
   assets immuables.

## Cas exceptionnels

`--migrate-legacy-assets` est prévu uniquement pour la première migration
d’une release antérieure au manifeste d’assets actuel. `--recover-stale-lock`
ne s’emploie qu’après avoir vérifié qu’aucun autre déploiement n’est actif.
Ce ne sont pas des options de dépannage courant.

Le script n’est pas un outil de rollback manuel. En cas d’échec après transfert
ou d’état distant inattendu, conserver les sorties, arrêter les tentatives et
suivre la procédure d’exploitation convenue avec les mainteneurs.

## Invariants à préserver lors d’une modification

- ne pas supprimer la confirmation de tag PROD;
- ne pas court-circuiter la CI de release, la vérification d’empreinte ni la
  validation publique;
- ne pas introduire de chemin, hôte ou identifiant réel dans le dépôt;
- conserver le lien entre `KHARTIS_PUBLIC_URL_*`, `BASE_PATH` et la route
  effectivement publiée;
- tester au minimum les deux `dry-run` après une modification du script.
