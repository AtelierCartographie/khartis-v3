---
paths:
  - 'src/lib/features/**'
  - 'tests/**'
  - 'messages/**'
---

# Cartographic domain

Khartis makes thematic maps: a data variable drives the styling of map geometry. Issues, the specification and the UI are written in French, the code in English.

## French terms and their code names

| French (UI, specification, issues)                                             | Code                                                                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Étapes Données, Visualisations, Habillage                                      | `ToolbarStep.Data`, `.Visualizations`, `.Styling`                                                |
| Fond de carte                                                                  | basemap, from the catalog or imported by the user                                                |
| Géolocalisation                                                                | geolocation: geographic columns recognized as names or codes (join) or as lat/lon (plotting)     |
| Jointure : jointe, à vérifier, non unique, non reconnue, ignorée               | join, graded with `JoinStatus`: `joined`, `to_verify`, `duplicate`, `unrecognized`, `ignored`    |
| Figuré ponctuel, linéaire, zonal, texte                                        | primitive: `symbol`, `line`, `polygon`, `text` (`PrimitiveConfigKind`)                           |
| Discrétisation, bornes, valeur de rupture                                      | classification (`ClassificationMethod`), breaks, breakpoint; message keys say `discretization_*` |
| Aplat, trame                                                                   | flat fill, pattern fill                                                                          |
| Calques                                                                        | layers (`VisualizationTools.Layers`)                                                             |
| Collection de cartes                                                           | facets (`VisualizationTools.Facets`)                                                             |
| Simplification, généralisation                                                 | simplification (`VisualizationTools.Simplification`)                                             |
| Format, légende, indications géographiques, annotations, déficiences visuelles | `StylingTools.Format`, `.Legend`, `.GeoIndications`, `.Annotations`, `.ColorBlindness`           |
| Carton, encart                                                                 | inset map (`InsetMapType`)                                                                       |
| Infobulle                                                                      | tooltip                                                                                          |
| Emprise                                                                        | extent, bbox                                                                                     |

## The semiology model

A visualization is one or more primitives, each driven by a variable through a mode: unique (constant style), proportional (size or width follows a quantity), classes (a quantity split into classes), categories (a qualitative variable). The enums are `SymbolMode`, `FillMode`, `ColorMode` and `SizeMode`. Express a new feature in those terms and attach each styling option to one primitive, which keeps its own show, hide and filter controls.

- A choropleth maps a classified ratio or rate. Absolute counts belong to proportional symbols; the suggester and the UI wording rely on that distinction.
- Equal-area projections are the safe default for choropleths, since they preserve the areas the reader compares.

## Product behaviors to preserve

- The map reflects every parameter change immediately: style, classification, color, projection, layout.
- Basemaps, visualizations, projections and palettes are offered as ranked suggestions with the best one preselected, and the user can always override. Reuse the scoring services (`viz-suggester.service.ts`, `projection-suggest.service.ts`) rather than hard-coding a choice.
- Long operations (import, join, classification, reprojection, export) show a loader, never a frozen UI.
- Everything is reachable and operable from the keyboard, `Esc` closes or cancels, focus stays visible, and icon-only controls are labelled (RGAA).
