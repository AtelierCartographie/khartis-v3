# Raccourcis Clavier

## Vue d'ensemble

Le composant `keyboard-shortcuts.svelte` gère tous les raccourcis clavier de l'application. Il fournit une navigation rapide, des contrôles de zoom et la gestion des modales via le clavier.

## Raccourcis disponibles

### Navigation entre étapes

| Touche | Action         | Description                                      |
| ------ | -------------- | ------------------------------------------------ |
| `1`    | Données        | Navigue vers l'étape de gestion des données      |
| `2`    | Visualisations | Navigue vers l'étape de visualisation            |
| `3`    | Habillage      | Navigue vers l'étape d'habillage et mise en page |

Si la barre latérale est réduite, elle s'ouvre automatiquement lors de la navigation.

### Contrôles de zoom

| Raccourci            | Action         | Description                           |
| -------------------- | -------------- | ------------------------------------- |
| `Ctrl/Cmd` + `+`     | Zoom avant     | Augmente le niveau de zoom            |
| `Ctrl/Cmd` + `=`     | Zoom avant     | Alternative au +                      |
| `Ctrl/Cmd` + `-`     | Zoom arrière   | Diminue le niveau de zoom             |
| `Ctrl/Cmd` + `0`     | Réinitialiser  | Retour au niveau de zoom par défaut   |
| `Alt` + `Z`          | Basculer mode  | Bascule entre zoom carte et zoom page |
| `Ctrl/Cmd` + molette | Zoom dynamique | Zoom continu avec la molette          |

### Échappement et fermeture

| Touche   | Action        | Priorité                                |
| -------- | ------------- | --------------------------------------- |
| `Escape` | Fermer modal  | 1. Ferme le modal de création de projet |
| `Escape` | Réduire barre | 2. Réduit la barre latérale à 50px      |
| `Escape` | Fermer outil  | 3. Désélectionne l'outil actif          |

L'ordre de priorité garantit un comportement prévisible.

## Sécurité des champs de saisie

Les raccourcis sont **automatiquement désactivés** dans les contextes suivants:

- Champs `<input>`
- Zones `<textarea>`
- Éléments avec `contentEditable="true"`

Exception: `Escape` fonctionne toujours pour fermer les modales.

## Architecture du code

### Structure

```typescript
const NAVIGATION_SHORTCUTS: Record<string, ToolbarStep> = {
  '1': ToolbarStep.Data,
  '2': ToolbarStep.Visualizations,
  '3': ToolbarStep.Styling
};
```

### Handlers spécialisés

- `isInputField()` - Détecte les champs de saisie
- `handleEscapeKey()` - Gère la cascade Escape
- `handleNavigationKey()` - Navigation entre étapes
- `handleZoomKey()` - Contrôles de zoom
- `handleZoomModeToggle()` - Bascule mode zoom
- `handleWheel()` - Zoom avec molette

### Extensibilité

Pour ajouter un nouveau raccourci de navigation:

```typescript
const NAVIGATION_SHORTCUTS: Record<string, ToolbarStep> = {
  '1': ToolbarStep.Data,
  '2': ToolbarStep.Visualizations,
  '3': ToolbarStep.Styling,
  '4': ToolbarStep.NewStep // Ajouter ici
};
```

Pour ajouter un nouveau raccourci zoom:

```typescript
function handleZoomKey(key: string): boolean {
  switch (key) {
    case '+':
    case '=':
      globalActions.zoomIn();
      return true;
    case 'r': // Nouveau raccourci
      globalActions.resetToDefaultView();
      return true;
    // ...
  }
}
```

## Tests E2E

Fichier: `e2e/04-transverses/raccourcis-clavier.spec.ts`

### Tests implémentés

✅ Navigation touches 1, 2, 3
✅ Zoom Ctrl+Plus et Ctrl+Minus
✅ Escape réduit la barre latérale
✅ Raccourcis désactivés dans les inputs

### Tests à implémenter

⏭️ Alt+Z bascule mode zoom
⏭️ Escape ferme les modales (géré par Carbon)

## Performance

- Event listeners montés une seule fois via `onMount`
- Cleanup automatique au démontage du composant
- Early returns pour minimiser les calculs
- Pas de re-renders (composant sans template)

## Références CDC

**Section 3.F** - Raccourcis clavier de base

- Navigation entre étapes du parcours utilisateur
- Accès rapide aux outils
- Touche Escape pour annuler/fermer

## Compatibilité

- ✅ macOS (Cmd au lieu de Ctrl)
- ✅ Windows/Linux (Ctrl)
- ✅ Navigateurs modernes (Chrome, Firefox, Safari, Edge)
- ✅ Accessibilité WCAG 2.1 AA

## Maintenance

Le code suit les principes:

- **Single Responsibility** - chaque fonction a un rôle unique
- **DRY** - configuration centralisée dans `NAVIGATION_SHORTCUTS`
- **KISS** - logique simple sans abstractions inutiles
- **Self-documenting** - noms de fonctions explicites
