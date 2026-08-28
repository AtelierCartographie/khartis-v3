# Contribuer et tester

Ce guide décrit le parcours de travail local attendu pour une contribution au
code de Khartis. Il complète les règles du dépôt et les documents spécialisés :
la compatibilité des projets est décrite dans
[PROJECT_FORMAT_COMPATIBILITY.md](PROJECT_FORMAT_COMPATIBILITY.md), et la mise
en ligne dans [DEPLOYMENT.md](DEPLOYMENT.md).

## Installer l'environnement

Le dépôt requiert Node.js `>=22 <25` et pnpm `>=10`. Corepack est le moyen
recommandé pour obtenir la version de pnpm déclarée par le projet.

```sh
corepack enable pnpm
pnpm install
pnpm dev
```

Le serveur de développement écoute par défaut sur le port `5176`. Il configure
les en-têtes nécessaires à l'isolation cross-origin, indispensable notamment
au runtime DuckDB et à certains traitements en worker.

L'installation lance `pnpm download:extensions`. Ce script télécharge les
extensions DuckDB `spatial`, `httpfs`, `parquet` et `json` pour les deux
variantes WebAssembly utilisées par l'application, puis les place dans les
ressources statiques attendues par le runtime. Une connexion à
`extensions.duckdb.org` est donc nécessaire lors d'une première installation
ou après une mise à jour de DuckDB.

Si cette étape échoue ou si le runtime signale une extension absente, corriger
d'abord le problème réseau ou de version, puis relancer :

```sh
pnpm download:extensions
```

Ne pas modifier les fichiers d'extensions à la main. Le script aligne leur
version sur le binaire DuckDB distribué par le projet. Une configuration
secrète n'est pas nécessaire pour démarrer l'application locale ; les modèles
`.env` servent au déploiement local et ne doivent pas recevoir de secret dans
le dépôt.

Pour vérifier un artefact de production localement :

```sh
pnpm build
pnpm preview
```

## Repères de développement

Le code applicatif se trouve sous `src/`. Les fonctionnalités exposent leur
surface publique par leurs modules d'index ; traverser ces frontières plutôt
que d'importer des détails internes d'une autre fonctionnalité. Les composants
Svelte utilisent les runes, les écrans réemploient les composants Carbon, et
le TypeScript évite `any`, les assertions non nécessaires et les contournements
du typage.

Les textes visibles sont localisés en français et en anglais. Modifier les
messages source des deux langues, ne jamais éditer `src/lib/paraglide/`, puis
laisser `pnpm check` compiler Paraglide. La traduction automatique est une aide
optionnelle, pas une validation linguistique.

Quelques invariants évitent des régressions coûteuses :

- Les formats géographiques pris en charge passent par DuckDB et ses
  opérations spatiales ; ne pas ajouter un parseur JavaScript concurrent pour
  contourner ce chemin.
- Les géométries restent en représentation binaire entre DuckDB, Arrow et le
  rendu Deck.gl. Une conversion générale en GeoJSON ou en objets JavaScript sur
  le chemin de rendu fait perdre les garanties de mémoire et de performance.
- La persistance sépare les métadonnées des octets source. Toute évolution de
  projet ou d'archive respecte le contrat et les migrations documentés dans
  [PROJECT_FORMAT_COMPATIBILITY.md](PROJECT_FORMAT_COMPATIBILITY.md).
- Les diagnostics applicatifs passent par le journal du projet plutôt que par
  des `console.log` permanents. Ne jamais mettre de données utilisateur ni de
  secret dans un journal.

Les jeux de données de démonstration sont servis seulement par Vite en mode
développement sous `/tests-datasets/`. Avec un chemin de base, leur URL doit
conserver ce préfixe. Ils ne constituent pas une ressource de production.

## Matrice de validation locale

Exécuter les validations lourdes séquentiellement. Choisir le plus petit
ensemble qui couvre réellement la modification, puis compléter par la matrice
ci-dessous.

| Modification                                        | Validation minimale                                           | Complément utile                                                             |
| --------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Documentation, configuration sans effet applicatif  | `pnpm lint`                                                   | `git diff --check`                                                           |
| Composant Svelte, store, utilitaire client          | `pnpm test:unit` puis `pnpm check`                            | Parcours manuel ciblé avec `pnpm dev`                                        |
| Import, pipeline de données, transformation serveur | `pnpm test:pipeline`                                          | Jeu de données représentatif dans l'application                              |
| Macro ou comportement DuckDB                        | `pnpm test:duckdb`                                            | `pnpm test:pipeline` si le changement traverse l'import ou l'orchestration   |
| Rendu cartographique ou WebGL                       | `pnpm test:unit` puis `pnpm build`                            | Vérification manuelle avec plusieurs exemples et formats de `tests-datasets` |
| Projet, archive ou migration                        | `pnpm test:pipeline`                                          | Aller-retour manuel sur une copie de projet compatible                       |
| Service worker, chemin de base ou build             | `pnpm test:pipeline` puis `pnpm build`                        | Vérification de l'artefact avec `pnpm preview`                               |
| Contribution large ou avant remise                  | `pnpm lint`, `pnpm check`, `pnpm test:all`, puis `pnpm build` | Relecture du diff et du scénario utilisateur concerné                        |

Les commandes groupées correspondent exactement aux projets Vitest définis
dans le dépôt :

```sh
pnpm test:unit      # projet client
pnpm test:pipeline  # projet serveur, dossier tests/pipeline
pnpm test:duckdb    # projet serveur, dossier tests/duckdb
pnpm test:all       # les trois commandes précédentes
```

Pour itérer, lancer Vitest via pnpm est valide. Par exemple :

```sh
pnpm exec vitest --project client
pnpm exec vitest run --project client src/chemin/vers/le-test.svelte.test.ts
pnpm exec vitest run --project server tests/pipeline/nom-du-test.test.ts
```

Les tests unitaires sous JSDOM ne prouvent pas un rendu GPU. Une modification
WebGL, de couche Deck.gl ou de cycle de vie MapLibre demande aussi un contrôle
visuel et fonctionnel dans un navigateur compatible.

## Ce que vérifie l'intégration continue

Le workflow de validation des demandes de fusion s'exécute pour les cibles
`staging` et `main`, ainsi que pour les groupes de fusion. Après une
installation figée, il exécute, dans cet ordre :

```sh
pnpm compile:paraglide
pnpm lint
pnpm check
pnpm test:unit
pnpm test:pipeline
pnpm test:duckdb
pnpm build
```

Les tests client font donc bien partie de l'intégration continue. Les branches
`staging` et `main` suivent les mêmes contrôles lors d'une publication, avant
la phase de versionnage automatisée. Ne pas considérer une compilation ou un
test isolé comme l'équivalent de cette chaîne.

## Préparer une contribution

1. Lire les conventions du dépôt et conserver les changements déjà présents
   dans l'arbre de travail. Ne pas réinitialiser, déplacer ou incorporer des
   modifications qui ne relèvent pas de la contribution.
2. Créer ou réutiliser la branche de travail autorisée par la politique du
   dépôt. Garder la demande de fusion ciblée sur la branche indiquée par
   l'équipe.
3. Limiter le diff à un objectif cohérent, mettre à jour les deux langues et la
   documentation concernée quand le comportement développeur change.
4. Exécuter la matrice de validation adaptée, puis relire `git status` et le
   diff final.
5. Employer un message Conventional Commit, par exemple `feat:`, `fix:`,
   `docs:`, `refactor:`, `perf:`, `test:`, `build:`, `ci:` ou `chore:`.

Le crochet de pré-commit applique les règles aux fichiers indexés et exécute le
contrôle de cohérence documentaire. Par défaut, ce contrôle signale les
évolutions à documenter ; `DOC_SYNC_STRICT=1` le rend bloquant. Le crochet de
message valide Conventional Commits. Ces crochets n'annulent pas la nécessité
d'exécuter les vérifications adaptées au changement.

La politique du dépôt interdit la fusion par squash. La fusion d'une demande
de fusion préserve les commits selon le processus des mainteneurs. Ne pas
forcer une branche, ni publier une modification qui n'a pas été relue dans son
contexte de données, de rendu ou de compatibilité.

## Dépanner sans masquer le problème

Une initialisation DuckDB qui échoue se diagnostique dans cet ordre : vérifier
la disponibilité des extensions locales, vérifier les en-têtes d'isolation et
les erreurs du worker, puis relancer après correction. Éviter de remplacer le
chemin DuckDB par une implémentation locale provisoire, car cela modifierait le
comportement et les performances réels.

Pour un problème de build, commencer par `pnpm check`, puis par le test du
projet concerné. Pour un écart local lié au chemin de base ou au cache PWA,
consulter [PWA_RUNTIME.md](PWA_RUNTIME.md) avant de supprimer des données du
navigateur.
