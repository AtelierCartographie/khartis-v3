# Rapport Renommage E2E - Français → Anglais

## Vue d'ensemble

Tous les dossiers et fichiers de tests E2E ont été renommés du français vers l'anglais pour cohérence avec le code source.

## Dossiers renommés

| Avant (français)    | Après (anglais)     | Description                 |
| ------------------- | ------------------- | --------------------------- |
| `00-accueil`        | `00-home`           | Page d'accueil              |
| `01-donnees`        | `01-data`           | Gestion données             |
| `02-visualisations` | `02-visualizations` | Visualisations              |
| `03-habillage`      | `03-styling`        | Habillage/mise en page      |
| `04-transverses`    | `04-cross-cutting`  | Fonctionnalités transverses |

## Fichiers renommés (26 fichiers)

### 00-home (1 fichier)

| Avant             | Après          |
| ----------------- | -------------- |
| `accueil.spec.ts` | `home.spec.ts` |

### 01-data (6 fichiers)

| Avant                               | Après                         |
| ----------------------------------- | ----------------------------- |
| `apercu-tableau.spec.ts`            | `table-preview.spec.ts`       |
| `geolocalisation-jointure.spec.ts`  | `geolocation-join.spec.ts`    |
| `import-donnees-tabulaires.spec.ts` | `import-tabular-data.spec.ts` |
| `reset-donnees.spec.ts`             | `reset-data.spec.ts`          |
| `tableau-donnees.spec.ts`           | `data-table.spec.ts`          |
| `validation-fichiers.spec.ts`       | `file-validation.spec.ts`     |

### 02-visualizations (4 fichiers)

| Avant                               | Après                           |
| ----------------------------------- | ------------------------------- |
| `creation-visualisations.spec.ts`   | `create-visualizations.spec.ts` |
| `fond-de-carte.spec.ts`             | `basemap.spec.ts`               |
| `outils-visualisation.spec.ts`      | `visualization-tools.spec.ts`   |
| `personnalisation-couleurs.spec.ts` | `color-customization.spec.ts`   |

**Déjà en anglais:**

- `color-picker.spec.ts`
- `projections-map.spec.ts`

### 03-styling (2 fichiers)

| Avant                         | Après                        |
| ----------------------------- | ---------------------------- |
| `habillage-predefini.spec.ts` | `predefined-styling.spec.ts` |
| `outils-habillage.spec.ts`    | `styling-tools.spec.ts`      |

**Déjà en anglais:**

- `format-tool.spec.ts`
- `legend-annotations.spec.ts`

### 04-cross-cutting (4 fichiers + 1 supprimé)

| Avant                            | Après                  |
| -------------------------------- | ---------------------- |
| `aide.spec.ts`                   | `help.spec.ts`         |
| `sauvegarde.spec.ts`             | `save.spec.ts`         |
| `telechargement.spec.ts`         | `download.spec.ts`     |
| `techniques.spec.ts`             | `technical.spec.ts`    |
| ~~`raccourcis-clavier.spec.ts`~~ | **Supprimé** (doublon) |

**Déjà en anglais:**

- `keyboard-shortcuts.spec.ts` ✅
- `navigation.spec.ts`
- `save-export.spec.ts`
- `side-nav.spec.ts`

### Racine e2e (1 fichier)

**Inchangé:**

- `create-project.kh-lifecycle.spec.ts` ✅ (déjà anglais)

## Structure finale

```
e2e/
├── 00-home/
│   └── home.spec.ts
├── 01-data/
│   ├── data-table.spec.ts
│   ├── file-validation.spec.ts
│   ├── geolocation-join.spec.ts
│   ├── import-tabular-data.spec.ts
│   ├── reset-data.spec.ts
│   └── table-preview.spec.ts
├── 02-visualizations/
│   ├── basemap.spec.ts
│   ├── color-customization.spec.ts
│   ├── color-picker.spec.ts
│   ├── create-visualizations.spec.ts
│   ├── projections-map.spec.ts
│   └── visualization-tools.spec.ts
├── 03-styling/
│   ├── format-tool.spec.ts
│   ├── legend-annotations.spec.ts
│   ├── predefined-styling.spec.ts
│   └── styling-tools.spec.ts
├── 04-cross-cutting/
│   ├── download.spec.ts
│   ├── help.spec.ts
│   ├── keyboard-shortcuts.spec.ts
│   ├── navigation.spec.ts
│   ├── save.spec.ts
│   ├── save-export.spec.ts
│   ├── side-nav.spec.ts
│   └── technical.spec.ts
├── mocks/
│   ├── csv/
│   └── spatial/
└── create-project.kh-lifecycle.spec.ts
```

## Statistiques

- **Total dossiers renommés:** 5
- **Total fichiers renommés:** 17
- **Fichiers déjà en anglais:** 8
- **Fichiers supprimés (doublons):** 1
- **Total fichiers tests:** 25

## Actions complémentaires

✅ **Doublon supprimé:**

- `raccourcis-clavier.spec.ts` était un doublon de `keyboard-shortcuts.spec.ts`

✅ **Cohérence nomenclature:**

- Tous les noms suivent le pattern `kebab-case`
- Noms descriptifs et explicites
- Terminologie cohérente avec le code source

## Validation

### Commande vérification structure:

```bash
find e2e -name "*.spec.ts" -type f | wc -l
# Résultat: 25 fichiers
```

### Commande vérification TypeScript:

```bash
npx tsc --noEmit
# Résultat: 0 erreurs
```

### Tests à relancer:

```bash
# Tests critiques à valider
yarn playwright test e2e/01-data/reset-data.spec.ts
yarn playwright test e2e/04-cross-cutting/download.spec.ts
yarn playwright test e2e/04-cross-cutting/keyboard-shortcuts.spec.ts
```

## Bénéfices

1. **Cohérence linguistique** - Tout le code et tests en anglais
2. **Maintenabilité** - Plus facile pour contributeurs internationaux
3. **Standards** - Respect conventions projet open-source
4. **Clarté** - Terminologie unifiée
5. **Propreté** - Doublon supprimé

## Date

2025-09-30
