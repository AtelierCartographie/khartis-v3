# Test manuel — Issue #102 : Jointure assistée

> **Objectif** : Vérifier que la jointure assistée fonctionne correctement pour tous les cas de figure (jointes, à vérifier, non reconnues, doublons, ignorées).
> **Prérequis** : `pnpm dev` lancé, navigateur ouvert sur `http://localhost:5176/cartographie/khartisnewpprd/`

---

## Datasets de test

| Fichier                    | Chemin                                                     | Usage                                  |
| -------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| `fuzzy-countries.csv`      | `static/tests-datasets/csv/fuzzy-countries.csv`            | S2, S3, S5 — typos et entité inconnue  |
| `khartis-large-joined.csv` | `/tmp/khartis-issue-102-datasets/khartis-large-joined.csv` | S1 — 25 pays européens                 |
| `khartis-doublons.csv`     | `/tmp/khartis-issue-102-datasets/khartis-doublons.csv`     | S4 — France en double                  |
| `khartis-aliases.csv`      | `/tmp/khartis-issue-102-datasets/khartis-aliases.csv`      | S1.1c.iii — codes ISO comme alias      |
| `khartis-mix.csv`          | `/tmp/khartis-issue-102-datasets/khartis-mix.csv`          | S2, S3 — mix corrects, typos, inconnus |

---

## S0 — Landing page

1. Ouvrir l'URL du projet
2. **Attendu** : page d'accueil Khartis visible, titre "Khartis" dans l'onglet
3. Dismiss le bandeau de cookies si présent

---

## S1 — Entités jointes

### S1.1a Affichage des jointures

1. Cliquer **Nouveau projet**
2. Importer `khartis-large-joined.csv`
3. Sélectionner la colonne `entity` comme variable de géolocalisation
4. Choisir un fond de carte **Pays**
5. Cliquer **Créer**
6. Aller dans l'onglet **Données** → étape **Joindre**
7. **Attendu** : section "XX entités jointes" affiche 25 lignes

### S1.1b Scroll vertical

1. Déplier la section "entités jointes"
2. **Attendu** : la liste défile (hauteur max ~480px, scrollbar visible si > 25 lignes)

### S1.1c.i Identifiants visibles

1. Dans la liste jointe, survoler une ligne
2. **Attendu** : la cellule de gauche affiche la valeur du dataset (ex: "Ireland")

### S1.1c.ii Dropdown actif

1. Regarder le `<select>` d'une ligne jointe
2. **Attendu** : le select n'est pas `disabled`, la valeur correspond au pays du fond de carte

### S1.1c.iii Tooltip autres identifiants

1. Importer `khartis-aliases.csv` (codes ISO : FRA, FR, DE…)
2. Rejoindre sur un fond de carte pays
3. Déplier "entités jointes"
4. Survoler l'icône **ℹ️** (info) sur une ligne où plusieurs identifiants sont possibles
5. **Attendu** : un tooltip natif apparaît avec la liste des autres identifiants trouvés
6. Si aucun autre identifiant, l'icône est grisée (`disabled`)

### S1.1c.iv Ignorer une jointure

1. Sur une ligne jointe, cliquer l'icône **✕** (Ignorer)
2. **Attendu** : la ligne disparaît, compteur "jointes" -1, compteur "ignorées" +1

### S1.1c.v État validé

1. Regarder la 3ème icône d'action d'une ligne jointe
2. **Attendu** : ce n'est pas un bouton cliquable mais un `<span>` avec `aria-label="Association validée"`

### S1.1d Dropdown avec autres options

1. Regarder le `<select>` d'une ligne jointe
2. Ouvrir le dropdown
3. **Attendu** : la liste contient d'autres pays du fond de carte en plus de la valeur actuelle

---

## S2 — Entités à vérifier

### S2.2a Affichage

1. Importer `fuzzy-countries.csv` (Frnace, Gremany, Brazill, Unknownland)
2. Choisir fond de carte **Pays**
3. Aller dans l'onglet **Données** → étape **Joindre**
4. **Attendu** : section "3 entités à vérifier" visible

### S2.2b Dropdown de correction

1. Déplier "entités à vérifier"
2. **Attendu** : chaque ligne a un `<select>` avec des suggestions (ex: Frnace → FRA, France)

### S2.2c Valider une correction

1. Sélectionner la bonne valeur dans le dropdown (ex: Frnace → France)
2. Cliquer l'icône **✓** (Valider)
3. **Attendu** : la ligne disparaît de "à vérifier", compteur "jointes" +1

### S2.2d Ignorer une entité à vérifier

1. Sur une ligne "à vérifier", cliquer l'icône **✕** (Ignorer)
2. **Attendu** : la ligne disparaît, compteur "à vérifier" -1, compteur "ignorées" +1

---

## S3 — Entités non reconnues

### S3.3a Affichage et dropdown

1. Avec `fuzzy-countries.csv`, déplier "entités non reconnues"
2. **Attendu** : Unknownland apparaît avec un input "Sélectionner une valeur du fond de carte..."
3. Cliquer sur l'input
4. **Attendu** : un menu déroulant s'ouvre avec les pays du fond de carte

### S3.3b Mapping manuel

1. Dans le dropdown d'une entité non reconnue, choisir un pays (ex: Atlantis → Bahamas si présent)
2. **Attendu** : la valeur s'affiche dans l'input, la ligne peut être validée

### S3.3c Ignorer une non reconnue

1. Cliquer **✕** (Ignorer) sur une ligne "non reconnue"
2. **Attendu** : compteur "non reconnues" -1, compteur "ignorées" +1

---

## S4 — Doublons

### S4.4a Affichage des lignes répétées

1. Importer `khartis-doublons.csv` (France ×2, Germany, Spain, Italy)
2. Choisir fond de carte **Pays**
3. Aller dans **Données** → **Joindre**
4. Déplier "entités répétées"
5. **Attendu** : "France" apparaît avec les numéros de lignes (ex: "1, 2")

### S4.4b Notification

1. **Attendu** : un bandeau d'information s'affiche avec le texte :
   > _"Pour chaque entité répétée, seule la première occurrence a été jointe. Les lignes concernées sont indiquées ci-dessous."_

---

## S5 — Entités ignorées

### S5.5a Affichage

1. Après avoir ignoré au moins une entité (depuis S1, S2 ou S3)
2. Déplier la section "entités ignorées"
3. **Attendu** : la ou les entités ignorées sont listées

### S5.5b Rétablir

1. Cliquer l'icône **↩** (Rétablir) sur une entité ignorée
2. **Attendu** : l'entité rejoint "non reconnues", compteur "ignorées" -1

---

## S6 — Comportements transversaux

### S6.T1 Accordion par défaut

1. Créer un nouveau projet avec `khartis-mix.csv`
2. Aller directement à l'étape **Joindre**
3. **Attendu** : seule la section "à vérifier" est dépliée par défaut si elle contient des éléments; "jointes" est repliée

### S6.T2 Pas de notification "Correction"

1. Vérifier qu'aucune notification inline ne mentionne "Correction" ou "correction" dans l'étape **Joindre**
2. **Attendu** : pas de bannière de correction (feature retirée)

### S7.T1 Cold start Carbon Select

1. Recharger la page (F5) alors que l'étape **Joindre** est active
2. **Attendu** : tous les `<Select>` Carbon ont une valeur sélectionnée (`selectedIndex >= 0`), pas de placeholder vide

---

## Checklist finale

Copier cette checklist et cocher après chaque test :

- [ ] S0 — Landing page charge
- [ ] S1.1a — 25 pays jointés avec `khartis-large-joined.csv`
- [ ] S1.1b — Scroll vertical fonctionne
- [ ] S1.1c.i — Identifiants visibles
- [ ] S1.1c.ii — Dropdown actif
- [ ] S1.1c.iii — Tooltip autres identifiants (tester avec `khartis-aliases.csv`)
- [ ] S1.1c.iv — Ignorer une jointure
- [ ] S1.1c.v — État validé = span non cliquable
- [ ] S1.1d — Dropdown contient d'autres options
- [ ] S2.2a — 3 entités à vérifier avec `fuzzy-countries.csv`
- [ ] S2.2b — Dropdown de correction présent
- [ ] S2.2c — Valider une correction
- [ ] S2.2d — Ignorer une entité à vérifier
- [ ] S3.3a — Dropdown non reconnues s'ouvre
- [ ] S3.3b — Mapping manuel fonctionne
- [ ] S3.3c — Ignorer une non reconnue
- [ ] S4.4a — Lignes doublons affichées avec numéros
- [ ] S4.4b — Notification doublons visible
- [ ] S5.5a — Section ignorées affiche les entités
- [ ] S5.5b — Rétablir fonctionne
- [ ] S6.T1 — Accordion par défaut correct
- [ ] S6.T2 — Pas de notification "Correction"
- [ ] S7.T1 — Selects Carbon OK après cold start
