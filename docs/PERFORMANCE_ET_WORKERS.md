# Performance, workers et rendu cartographique

Khartis traite des données géographiques parfois volumineuses dans le
navigateur. Les performances reposent moins sur une optimisation isolée que
sur la continuité d'un chemin de données : lecture et requêtes dans DuckDB,
tables Arrow, géo-Arrow, puis couches de rendu. Ce guide expose les invariants
à conserver lorsque l'on modifie ce chemin.

## Répartition des responsabilités

Le moteur DuckDB est exécuté dans son propre worker WebAssembly. Son
initialisation est mutualisée afin que plusieurs consommateurs ne créent pas
plusieurs moteurs concurrents. Le runtime choisit le bundle compatible avec le
navigateur et applique une limite mémoire dépendante de l'appareil ; cette
politique appartient au moteur, pas à un composant d'interface.

Le traitement des géométries dispose d'un worker de parsing chargé à la demande.
Il sert à déplacer hors du fil principal le travail compatible avec ce chemin,
sans rendre l'application dépendante d'un worker toujours disponible. En cas
d'erreur ou de délai dépassé, le chemin établi désactive proprement le worker et
utilise le repli prévu plutôt que de multiplier les tentatives concurrentes.

Le rendu cartographique est géré par son cycle de vie commun : Deck.gl pour les
vues orthographiques et MapLibre avec l'overlay approprié pour les vues
cartographiques. Initialiser directement un moteur parallèle dans un composant
est une source de fuites WebGL, d'abonnements persistants et de toiles
superposées. Réutiliser le point d'initialisation et de destruction existant.

## Conserver le chemin binaire

Le passage normal des géométries est binaire : DuckDB produit des tables Arrow,
puis les adaptateurs géo-Arrow alimentent Deck.gl. Les fonds catalogués suivent
le même principe, depuis GeoParquet jusqu'aux tables rendues. Ce choix évite de
dupliquer de grands objets JavaScript et limite les copies de données.

Lorsqu'une évolution touche un import ou une couche :

- privilégier les opérations DuckDB pour filtrer, projeter et transformer les
  données prises en charge ;
- transmettre les tables Arrow et leurs buffers au chemin de rendu prévu ;
- isoler explicitement tout passage temporaire en GeoJSON ou en objets simples,
  avec une justification et une mesure de son coût ;
- ne pas recréer des structures de données équivalentes à chaque réaction
  Svelte ou à chaque image affichée.

Une nouvelle requête produit naturellement une nouvelle table. En revanche,
cloner une table inchangée détruit les caches fondés sur son identité et rend le
travail de sérialisation ou de projection à chaque rendu.

## Caches : identité, durée de vie et mémoire

Le chemin de rendu mémorise notamment les octets Arrow sérialisés et certains
résultats de projection. Ces caches sont intentionnellement associés aux objets
de table et sont bornés là où une projection peut devenir coûteuse. Ils ne sont
pas des caches globaux à purger depuis une vue pour "réparer" une carte.

Trois types d'état ne doivent pas être confondus :

| État                       | Finalité                                                               | Conséquence pour une modification                                                  |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Cache de calcul en mémoire | Éviter de sérialiser ou reprojeter une table inchangée                 | Préserver l'identité des données et laisser le cycle de vie libérer les références |
| Cache du service worker    | Réutiliser les ressources applicatives et cartographiques téléchargées | Ne pas l'utiliser comme stockage de projet ni comme cache de calcul                |
| Persistance IndexedDB      | Conserver les sources et les projets locaux                            | Respecter le schéma, les migrations et la récupération de projet                   |

La mémoire DuckDB est volontairement bornée en fonction des capacités déclarées
par l'appareil, avec une valeur de repli lorsqu'elles sont inconnues. Ne pas
remplacer cette limite par une constante dans une fonctionnalité pour résoudre
un cas local. Réduire plutôt les colonnes, les jeux de données intermédiaires
et les copies évitables, puis mesurer l'effet sur un appareil représentatif.

## Cycle de vie des workers et du GPU

Un changement de moteur, une fermeture de vue ou la destruction d'un composant
doit libérer ses ressources par le cycle de vie partagé. Ce cycle désabonne les
observateurs, finalise les overlays et les instances Deck.gl, retire la carte
MapLibre et nettoie la toile de repli. Toute nouvelle ressource créée hors de
ce cycle doit avoir une destruction symétrique et vérifiable.

Les couches Deck.gl sont des objets immuables. Mettre à jour une couche consiste
à construire l'instance ou les propriétés attendues par Deck.gl, pas à modifier
silencieusement un objet déjà rendu. L'application gère également le facteur de
pixels et l'indisponibilité éventuelle de WebGL2. Une fonctionnalité ne doit pas
supposer l'accélération GPU, ni imposer un facteur de pixels fixe adapté à une
seule machine.

Un worker DuckDB défaillant est nettoyé afin que l'initialisation puisse être
tentée de nouveau après correction. Traiter l'erreur à sa frontière et garder
les messages assez précis pour distinguer une extension absente, un problème
d'isolation cross-origin ou une erreur de requête.

## Méthode de mesure

Mesurer un changement sur un scénario utile, pas seulement sur un petit fichier
artificiel. Choisir au moins un exemple de données, un style et une interaction
qui exercent la zone modifiée, puis comparer avant et après :

1. le temps entre l'action et l'affichage exploitable ;
2. l'activité du fil principal et des workers ;
3. la mémoire du processus et le nombre de toiles ou de workers actifs ;
4. la fluidité pendant les déplacements, les changements de couche et les
   interactions concernées.

Modifier une seule variable à la fois. Les outils de performance du navigateur
et les diagnostics de développement de la carte servent à localiser le travail
excessif ; ils ne remplacent pas une validation sur les données représentatives.
Les variables `VITE_*` destinées au diagnostic sont visibles côté client : ne
jamais y placer une information sensible.

## Vérifier une évolution du rendu

Les tests client vérifient la logique accessible sous JSDOM, mais ne valident
ni un contexte GPU réel ni les contraintes de mémoire d'un navigateur. Pour un
changement de worker, de projection, de couche ou de cycle de vie :

```sh
pnpm test:unit
pnpm build
pnpm dev
```

Ensuite, parcourir plusieurs exemples et formats disponibles dans
`tests-datasets`, notamment une situation qui force le changement de moteur ou
de projection. Vérifier aussi qu'une entrée puis une sortie de la vue ne laisse
pas de toile, de carte ou de comportement résiduel.

Un changement qui touche l'import, le passage DuckDB ou l'orchestration doit
ajouter :

```sh
pnpm test:pipeline
pnpm test:duckdb
```

La suite complète et les contrôles requis avant une remise sont détaillés dans
[CONTRIBUER_ET_TESTER.md](CONTRIBUER_ET_TESTER.md). Les règles de cache et de
mise à jour hors ligne sont documentées dans [PWA_RUNTIME.md](PWA_RUNTIME.md).

## Liste de contrôle avant validation

- Le changement conserve-t-il DuckDB, Arrow et le chemin binaire là où ils
  sont déjà utilisés ?
- Les données inchangées gardent-elles une identité stable entre deux rendus ?
- Les workers, observateurs et ressources WebGL ont-ils une libération
  symétrique ?
- L'absence de WebGL2 et l'échec d'un worker sont-ils traités par le flux
  établi ?
- La mesure est-elle faite avec une donnée et une interaction représentatives ?
- Les tests ciblés, le build et le contrôle navigateur adaptés sont-ils passés ?
