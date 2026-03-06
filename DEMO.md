# Khartis v3 — Guide de démonstration

Deux scénarios pour découvrir les fonctionnalités clés de Khartis v3.

## Résumé correctif issue #53

- Les fonds de carte personnalisés polygonaux sont maintenant prétraités dès l'import avec le pipeline topo DuckDB (`snap` + `simplify_and_clean(..., 0)`).
- Deux couches dérivées sont générées automatiquement : frontières internes (`innerlines`) et centroïdes.
- Les fonds points/lignes ne passent pas par ce pipeline, pour éviter les effets de bord.
- Validation faite par tests unitaires + `pnpm check`. La revalidation UI complète via Agent Browser reste bloquée par des erreurs Svelte déjà présentes hors périmètre du correctif.

## Résumé correctif issue #62

- La jointure réutilise maintenant le cache de similarité pour les suggestions et la finalisation, ignore les correspondances `toofar` à l’application et n’échoue plus lors de l’import d’un fond GeoJSON personnalisé.

Note présentation ce soir : la discrétisation utilise désormais correctement toutes les méthodes prévues, avec arrondi automatique des seuils et nombre de classes toujours synchronisé dans l’interface.

---

## Scénario 1 : CSV tabulaire + jointure à un fond de carte

**Fichier** : `fossil-fuel-subsidies-gdp-2021.csv` (disponible dans `static/tests-datasets/csv/`)
**Contenu** : 81 pays, 4 colonnes — `entity` (nom du pays), `code` (ISO3), `_year`, `fossilfuel_subsidies_consumption_and_production_as_a_proportion_of_total_gdp`
**Objectif** : Ce fichier n'a aucune géométrie. On va le joindre à un fond de carte du catalogue pour créer une carte choroplèthe.

### Etape Données

1. **Créer un nouveau projet** depuis l'accueil
2. **Importer le CSV** : glisser-déposer le fichier ou utiliser "Lien vers un fichier stocké en ligne"
3. **Aperçu du tableau** (section "1. Contrôler les données") :
   - 81 lignes affichées dans le panneau latéral droit
   - Types détectés automatiquement : `entity` (texte ABC), `code` (géographique, surligné en vert), `_year` (numérique 123), `fossilfuel_s...` (numérique avec histogramme)
   - Sous chaque colonne : résumé statistique (valeurs uniques, histogramme, min/max)
   - Barre d'outils du tableau : recherche, filtres, calculatrice, corbeille, paramètres
4. **Géolocalisation** (section "2. Géolocaliser les données") :
   - Khartis détecte automatiquement `code` comme variable géographique de type "Entités administratives"
   - Un message info confirme : "Khartis a automatiquement choisi une variable géographique"
   - Onglet "Géolocaliser" coché automatiquement en bas
5. **Jointure au fond de carte** (section "3. Joindre les données à un fond de carte") :
   - "Suggestions de Khartis" propose "World > countries" avec un taux de correspondance de 100%
   - La **jointure assistée** s'affiche automatiquement : 80 entités jointes, 1 non reconnue
   - Message vert : "Jointure validée — les données sont prêtes pour la visualisation"
   - 4 catégories dans le rapport : jointes, à vérifier, en double, non reconnues
6. **Résultat** : les 3 onglets (Contrôler ✓, Géolocaliser ✓, Joindre ✓) sont validés. Le bouton "Visualiser →" est actif.

### Etape Visualisation

7. **Cliquer "Visualiser →"** en bas à droite : passage à l'étape Visualisations
8. **Visualisation (1)** créée automatiquement, liée à `fossil-fuel-subsidies-gdp-2021.csv`
9. **Suggestions de visualisation** :
   - **Choroplèthe** sélectionnée par défaut sur la variable numérique `fossilfuel_s...`
   - **Symboles colorés (quantitatif relatif)** en 2e suggestion
   - La légende apparaît sur la carte avec les classes (ex: 0.1–0.4, 0.4–1.0, 1.0–3.1)
10. **Paramétrer la visualisation** (scroller dans le panneau droit) :
    - Activer/désactiver les primitives graphiques (polygones, symboles)
    - Changer la variable, la méthode de discrétisation, le nombre de classes
    - Personnaliser la palette de couleurs (séquentielle, divergente)
11. **Outils** (barre latérale gauche, section OUTILS) :
    - Recherche, Calques, Projections (pastille rouge = à explorer), Indications géo, Collection

---

## Scénario 2 : Fichier géographique (GeoJSON) sans jointure

**Fichier** : `nuts2_data.geojson` (disponible dans `static/tests-datasets/geojson/`)
**Contenu** : 332 régions NUTS2 européennes avec géométries (MultiPolygon) et 15+ variables attributaires — `POP_TOT_2023`, `GDP_CAP_PPS_2022`, `UNEMP_25P_2023`, `LIFE_EXP_2022`, `HIGH_EDU_2023`, `zone`, etc.
**Objectif** : Ce fichier contient déjà ses géométries et ses données. Pas de jointure nécessaire. On crée directement des visualisations.

### Etape Données

1. **Créer un nouveau projet**
2. **Importer le GeoJSON** : glisser-déposer ou utiliser le lien vers le fichier
3. **Aperçu du tableau** (section "1. Contrôler les données") :
   - 332 lignes, colonnes détectées : `NUTS_ID` et `NAME_LATN` (géographiques, en vert), puis les variables numériques
   - Avertissement jaune : "Plusieurs variables contiennent des valeurs manquantes" (normal)
   - Barre d'outils du tableau : recherche, filtres, calculatrice, corbeille (pas de paramètres CSV car c'est un GeoJSON)
   - En bas : **Contrôler → Enrichir → Visualiser** (pas de "Joindre" car les géométries sont déjà dans le fichier)
4. **Explorer les outils du tableau** (optionnel) :
   - **Filtre** : ajouter un filtre `zone = EU27` pour ne garder que les pays de l'UE
   - **Calculatrice** : créer une variable `Ratio jeunes/vieux` = `POP_024_RT_2023 / POP_65P_RT_2023`
   - **Tri** : trier par `GDP_CAP_PPS_2022` décroissant pour voir les régions les plus riches
5. **Le bouton "Visualiser →"** est actif immédiatement (pas besoin de jointure).

### Etape Visualisation — Plusieurs types

6. **Cliquer "Visualiser →"** : passage à l'étape Visualisations
7. **Visualisation (1)** créée automatiquement. Suggestions :
   - **Symboles proportionnels** sélectionnée par défaut sur `AREA_TOT_2024`
   - **Double symboles proportionnels** sur `AREA_TOT_2024` + `POP_TOT_2023`
   - Bouton "Créer sa visualisation" pour construire ex nihilo

8. **Changer de type** : dans "1. Choisir ou créer une visualisation", cliquer "Créer sa visualisation"
   - Activer la primitive **Polygones** et désactiver Symboles
   - Choisir la variable `GDP_CAP_PPS_2022` → choisir le mode "En classes" → choroplèthe
   - Ajuster la discrétisation (Jenks, 5 classes) et la palette de couleurs

9. **Ajouter une 2e visualisation** : cliquer "Ajouter +" en haut à droite
   - Sélectionner `POP_TOT_2023`
   - Activer **Symboles** proportionnels
   - Ajuster la taille min/max des symboles

10. **Gestion des calques** (icône calques dans la barre OUTILS à gauche) :
    - Afficher/masquer chaque visualisation
    - Réordonner les calques (symboles au-dessus de la choroplèthe)

11. **Projection** (icône projections dans la barre OUTILS, pastille rouge) :
    - Suggestions adaptées à l'emprise Europe
    - Tester différentes projections
    - Ajuster les paramètres de longitude/latitude/rotation

---

## Points clés à retenir

| Concept                  | Scénario 1 (CSV)             | Scénario 2 (GeoJSON)                |
| ------------------------ | ---------------------------- | ----------------------------------- |
| Géométries               | Aucune — jointure nécessaire | Incluses dans le fichier            |
| Fond de carte            | Catalogue Khartis (mondial)  | Le fichier lui-même                 |
| Jointure                 | Oui (ISO3 → fond de carte)   | Non nécessaire                      |
| Enrichissement           | Non                          | Possible (ajouter un CSV tabulaire) |
| Visualisations possibles | Toutes                       | Toutes                              |

- **Toutes les données restent dans le navigateur** — rien n'est envoyé à un serveur
- **Chaque action est sauvegardée automatiquement** dans le navigateur (IndexedDB)
- **Le projet peut être exporté** en fichier `.kh` pour être partagé ou repris plus tard
