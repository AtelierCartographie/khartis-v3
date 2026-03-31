# Plan de test — Step Toolbar (étape Visualisation)

Plan d'exécution pour Claude. Tester et corriger les 5 outils du panneau droit disponibles
à l'étape Visualisation, en se basant sur le cahier des charges (`cdc.md`).

---

## Protocole de test

### Outillage

- **Navigateur** : Chrome DevTools MCP (`mcp__plugin_chrome-devtools-mcp_chrome-devtools__*`)
- **Dev server** : `http://localhost:5176` (`pnpm dev` doit tourner)
- **Snapshots DOM** : `take_snapshot` pour inspecter l'état UI
- **Console** : `list_console_messages` pour détecter les erreurs JS/runtime
- **Screenshots** : `take_screenshot` pour documenter les bugs visuels

### Données de test disponibles (servies par le dev server)

| Fichier                                                                                          | Type                                     | Usage                                    |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------- |
| `http://localhost:5176/tests-datasets/csv/fossil-fuel-subsidies-gdp-2021.csv`                    | CSV tabulaire (pays, valeurs numériques) | Tests Search, Layers, Projection, Facets |
| `http://localhost:5176/tests-datasets/csv/naissances-par-commune-departement-et-region-2018.csv` | CSV tabulaire (communes FR)              | Tests Simplification basemap FR          |
| `http://localhost:5176/tests-datasets/csv/sites-seveso-idf.csv`                                  | CSV points GPS (lat/lon)                 | Tests Projection coordonnées             |
| `http://localhost:5176/tests-datasets/geojson/nuts2_data.geojson`                                | GeoJSON polygones NUTS2                  | Tests Simplification import geo          |

### Procédure entre chaque test

1. **Supprimer le projet** via la side nav (clic droit sur le projet → Supprimer, ou icône corbeille)
2. Vérifier que la side nav est vide / revenu à l'écran de création
3. Créer un nouveau projet avec le fichier indiqué pour le test suivant

---

## Ordre d'exécution

1. Search
2. Layers
3. Projection
4. Simplification
5. Facets

---

## 1. Search

**Référence CDC** : §2.B.4.a — _"Cet outil proposera une barre de recherche pour identifier une
entité ou une valeur, qui sera mise en lumière sur la carte. [...] une mise en avant de l'objet
pointé sur la carte avec une infobulle affichant les données attributaires de l'objet."_

**Données** : `fossil-fuel-subsidies-gdp-2021.csv` → joindre au fond Monde

**Scénarios à tester**

1. **Recherche simple**
   - Ouvrir l'outil Search (étape Visualisation, panneau droit)
   - Saisir `"France"` dans la barre de recherche
   - → Vérifier : nombre de résultats affiché, entité mise en surbrillance sur la carte,
     boutons précédent/suivant fonctionnels, infobulle visible au survol

2. **Recherche filtrée sur une colonne**
   - Restreindre la recherche à une colonne spécifique (ex. colonne `country`)
   - → Vérifier : les résultats sont bien filtrés à cette colonne uniquement

3. **Rechercher / Remplacer**
   - Saisir une valeur à remplacer, entrer la valeur de remplacement, cliquer "Remplacer"
   - → Vérifier : la valeur est bien modifiée dans le tableau de données (panneau gauche)
   - → Vérifier : la modification est persistée après fermeture/réouverture de l'outil

4. **Fermeture pendant recherche en cours**
   - Lancer une recherche, fermer l'outil immédiatement
   - → Vérifier : pas d'erreur console, la surbrillance carte est bien effacée

**À inspecter dans le code si bug**

- `search.store.svelte.ts` : debounce 250ms, `clearSearch()` nettoie `mapHighlightStore`
- Performance : `normalize_text()` pré-calculé (pas de `jaro_winkler` pour correspondance exacte)

---

## 2. Layers

**Référence CDC** : §2.B.4.b — _"Chaque calque de visualisation pourra être affiché/masqué,
proposera un raccourci vers le paramétrage et reprendra les mêmes fonctionnalités propres à la
gestion d'une visualisation, à savoir renommer, dupliquer, supprimer."_

**Données** : `fossil-fuel-subsidies-gdp-2021.csv` → joindre au fond Monde, créer 2 visualisations

**Scénarios à tester**

1. **Afficher / masquer une couche**
   - Ouvrir l'outil Layers
   - Cliquer sur l'icône œil d'une visualisation
   - → Vérifier : la couche disparaît/réapparaît sur la carte sans rechargement

2. **Réordonner les couches**
   - Glisser-déposer une couche pour changer son ordre
   - → Vérifier : l'ordre de rendu sur la carte est mis à jour

3. **Renommer une visualisation**
   - Double-clic ou bouton renommer → saisir un nouveau nom → valider
   - → Vérifier : le nouveau nom apparaît dans la liste et dans le panneau de configuration

4. **Dupliquer une visualisation**
   - Cliquer "Dupliquer" sur une couche
   - → Vérifier : une copie indépendante apparaît, modifiable sans affecter l'original

5. **Supprimer avec confirmation**
   - Cliquer "Supprimer" → modale de confirmation Carbon
   - → Vérifier : la couche est bien retirée de la carte et de la liste

6. **Hiérarchie bivariate** (si visualisation BIVARIATE créée)
   - → Vérifier : les deux sous-couches (taille + couleur) apparaissent bien en enfants

**À inspecter dans le code si bug**

- `layers.store.svelte.ts` : `syncWithVisualizations()` sur `visualizationStore.version`,
  absence de boucle réactive, IDs Deck.gl stables après réordonnancement

---

## 3. Projection

**Référence CDC** : §2.B.4.c — _"Une projection cartographique sera attribuée par défaut à chaque
fond de carte. Celle-ci pourra être modifiée et paramétrée dans cet outil dédié. Une incitation à
utiliser cet outil sera caractérisée par une pastille sur l'icône de cet outil, jusqu'à ce que
l'utilisateur l'utilise."_

**Données** : `fossil-fuel-subsidies-gdp-2021.csv` → fond Monde

**Scénarios à tester**

1. **Pastille first-time**
   - Sur un projet neuf, vérifier qu'une pastille/badge est visible sur l'icône Projections
   - Ouvrir l'outil → vérifier que la pastille disparaît et ne réapparaît pas au rechargement

2. **Suggestions de projections**
   - → Vérifier : des suggestions sont proposées, filtrables par catégorie
     (rectangulaires, arrondies, discontinues) — §2.B.4.c
   - → Vérifier : le mode grille (790px) et le mode liste sont fonctionnels

3. **Changer de projection**
   - Sélectionner "Equal Earth" puis "Mercator"
   - → Vérifier : la carte se re-projette en temps réel, sans perte de données

4. **Code CRS personnalisé**
   - Saisir `EPSG:2154` (Lambert-93) dans le champ code CRS
   - → Vérifier : la projection est bien appliquée, la carte se recadre

5. **Projection avec données points (coordonnées GPS)**
   - Charger `sites-seveso-idf.csv` (lat/lon), joindre, changer de projection
   - → Vérifier : les points restent correctement positionnés

**À inspecter dans le code si bug**

- `projection.store.svelte.ts` : `parseProjectionCode()`, bounds recalculées
- `src/lib/features/map/utils/proj4d3.ts` : transformation des coordonnées
- localStorage `khartis_projection_tool_opened` pour la pastille

---

## 4. Simplification

**Référence CDC** : §2.B.4.d — _"Les fonds de carte du catalogue pourront être simplifiés selon
trois niveaux prédéfinis : faible, moyen et élevé. [...] Les fonds de cartes importés par
l'utilisateur pourront quant à eux être simplifiés avec un taux de simplification défini par
l'utilisateur. Un avertissement préviendra du risque de suppression de certaines entités."_

**Données** :

- Test basemap catalogue : `naissances-par-commune-departement-et-region-2018.csv` → fond France Départements
- Test geo importé : `http://localhost:5176/tests-datasets/geojson/nuts2_data.geojson` (fond importé)

**Scénarios à tester**

1. **Simplification basemap — niveaux prédéfinis**
   - Ouvrir l'outil Simplification (source : Basemap)
   - Tester les 3 niveaux : Faible / Moyen / Élevé
   - → Vérifier : la géométrie change visuellement sur la carte à chaque niveau

2. **Simplification bloquée sur fond OSM**
   - Activer un fond OpenStreetMap, ouvrir l'outil
   - → Vérifier : l'option basemap est grisée/bloquée avec un message explicatif

3. **Simplification geo importé — slider**
   - Importer `nuts2_data.geojson` comme fond de carte
   - Passer sur la source "Géo", bouger le slider 0 → 50 → 100
   - → Vérifier : avertissement de risque affiché, géométrie simplifiée en temps réel

4. **Undo**
   - Appliquer une simplification, cliquer "Annuler"
   - → Vérifier : la géométrie revient à l'état précédent

5. **isProcessing**
   - Pendant un traitement en cours, vérifier que l'UI est bloquée (pas de double-clic possible)

**À inspecter dans le code si bug**

- `simplification.store.svelte.ts` : debounce 250ms sur `applySimplification`, `undoLastSimplification`
- La simplification geo ne modifie pas les données persistées dans DuckDB (transformation temporaire)

---

## 5. Facets

**Référence CDC** : §2.B.4.e — _"Une collection de cartes est un ensemble de cartes partageant les
mêmes données, permettant alors d'analyser et de comparer celle-ci. Dans le champ de la
datavisualisation, on parle de 'facettes' ou de 'small multiples'."_

**Données** : `fossil-fuel-subsidies-gdp-2021.csv` → fond Monde (visualisation choroplèthe)

> ⚠️ Chaque facette = une instance complète MapLibre + Deck.gl. Au-delà de 8 facettes,
> les navigateurs peuvent silencieusement perdre des contextes WebGL2. Tester avec
> modération (3-4 facettes max pour commencer).

**Scénarios à tester**

1. **Activation des facettes**
   - Ouvrir l'outil Facets avec une visualisation active
   - Sélectionner une variable de groupement (ex. continent ou région)
   - → Vérifier : les cartes multiples s'affichent en grille, une par valeur distincte

2. **Configuration du layout**
   - Modifier le nombre de colonnes/lignes
   - → Vérifier : la grille se réorganise correctement

3. **Synchronisation pan/zoom**
   - Activer `syncPanZoom`
   - Se déplacer sur une facette
   - → Vérifier : toutes les autres facettes suivent le même viewport

4. **scaleMode auto vs fixed**
   - Basculer entre les deux modes
   - → Vérifier : en `auto`, chaque carte adapte son échelle ; en `fixed`, toutes partagent la même

5. **Désactivation / nettoyage**
   - Désactiver les facettes
   - → Vérifier : retour à la carte unique, toutes les instances MapLibre/Deck.gl sont bien détruites
   - → Vérifier via `list_console_messages` : pas d'erreur WebGL residuelle

6. **Limite de variables**
   - Tenter d'activer avec une seule variable sélectionnée
   - → Vérifier : l'UI bloque avec un message (minimum 2 variables requis)

**À inspecter dans le code si bug**

- `facets.store.svelte.ts` : `disable()` appelle bien `map.remove()` sur chaque instance
- `thematic-map.svelte` : cleanup `$effect` return sur `onDestroy`
- Nombre de contextes WebGL2 actifs (max 8-16 selon browser)
