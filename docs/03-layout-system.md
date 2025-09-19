# Style and Layout System

## 1. Page Management

### 1.1 Formats and dimensions

#### Predefined formats

Built-in library of standard formats including ISO (A0-A5), US (Letter, Legal, Tabloid) and digital (16:9, 4:3, square). Each format stores width, height, and recommended margins. Portrait/landscape orientation is interchangeable with automatic recalculation.

#### Custom dimensions

Input in pixels with bounds validation (minimum 200x200, maximum 10000x10000). Automatic ratio calculation and suggestion of nearby formats. Real-time preview of the workspace.

### 1.2 Grid system

#### Composition grid

Modular grid based on a configurable unit (8 px by default). Supports column grids (12 or 16). Configurable gutters. Visibility toggle for precise work.

#### Snapping and alignment

Grid snapping with configurable threshold (5 px by default). Smart guides detecting alignments between objects. Guide lines for centering and distribution. Snapping to edges and anchor points.

### 1.3 Margin management

#### Safety margins

Non-printable zones for print export. Separate margins (top, bottom, left, right). Bleed visualization. Alerts for elements outside the safe area.

#### Adaptive margins

Automatic adaptation according to format. Proportional calculation to dimensions. Presets for different uses (print, web, presentation).

### 1.4 Behavior of the Format tool

A dedicated Format tool lets users choose from a list of page sizes selected by the project team or enter custom dimensions in pixels. When the size changes, elements are automatically redistributed to preserve a readable composition: title and subtitle top-left, map(s) centered, legends near the bottom of the map if needed, sources/signature/credits bottom-right. Page color, margins, and an optional snapping grid are adjusted here; the alignment grid is visible by default only during the Style step.

## 2. Textual Elements

### 2.1 Typology of texts

#### Text hierarchy

- Main title: H1 style, size 24-48 pt
- Subtitle: H2 style, size 18-24 pt
- Body text: size 10-14 pt
- Legends: size 8-10 pt
- Sources and credits: size 6-8 pt

#### Predefined text areas

At the start of the Style step, predefined text areas are placed on the page: title, subtitle, source, basemap source, signature, and the mention "Made with Khartis". These elements are movable and removable, inherit default styles, and are customized via the Annotations tool. If an area remains empty, it is omitted from exports.

### 2.2 Typographic formatting

#### Available fonts

Limited set of web fonts for cross-platform consistency. Serif, sans-serif, and monospace families. Fallback fonts for compatibility. Support for variants (bold, italic, condensed).

#### Typographic parameters

- Size in points with 0.5 increments
- Line height as ratio or pixels
- Letter spacing
- Word spacing
- Alignment (left, center, right, justified)
- Indentation and paragraph margins

### 2.3 Text styles

#### Style management

Creation of reusable named styles. Inheritance and property overrides. Library of predefined styles. Import/export of style sets.

#### Typographic effects

- Configurable drop shadow (offset, blur, color)
- Text outline
- Background with padding and radius
- Gradient effects on text
- Transformation (uppercase, lowercase, capitalization)

## 3. Map Legends

### 3.1 Automatic generation

#### Visualization analysis

Automatic extraction of visualized variables. Detection of representation type. Calculation of reference values. Generation of an appropriate structure.

#### Legend types

- Choropleth: colored boxes with class values
- Proportional symbols: nested reference circles
- Categories: list with colored symbols
- Bivariate: color matrix
- Combined: multiple sections organized

### 3.2 Customization

#### Legend structure

Editable title and subtitle. Optional explanatory notes. Reorderable items. Grouping multiple legends. A notification badge on the Legend tool encourages opening it to finalize configuration.

#### Formatting

- Orientation (vertical, horizontal)
- Spacing between items
- Size of reference symbols
- Number format (decimals, separators)
- Units and prefixes

Style changes (fonts, sizes, colors, background and opacity) can be applied consistently to all legends on the page to preserve visual harmony.

### 3.3 Positioning

#### Automatic placement

Algorithm avoiding overlaps with the map. Preference for low-information areas. Respect for margins and safety zones.

#### Manual adjustment

Drag-and-drop with alignment guides. Anchoring to corners or edges. Relative or absolute position. Z-order for stacking.

## 4. Map Elements

### 4.1 Scale bar

#### Scale types

- Simple linear: bar with divisions
- Double linear: kilometers and miles
- Alternating graphic: black/white boxes
- Numeric: textual ratio (1:50000)

#### Configuration

Automatic calculation based on projection and zoom. Configurable units (metric, imperial). Adjustable number of segments. Rounding to significant values.

### 4.2 Orientation

#### North arrow

Symbol library (simple arrow, ornamental). Automatic rotation if the map is oriented. Size proportional to the map. Customizable styles.

#### Compass rose

Classic and modern templates. Configurable cardinal points. Adaptive graphic style. Optional bilingual directions.

### 4.3 Inset (context map)

#### Localization function

Mini-map showing broader geographic context. Highlighting the main area. Independent zoom level. Simplified style for readability.

#### Inset types

- 3D globe: orthographic projection
- Planisphere: equirectangular projection
- Regional: enlarged context area
- Multi-scale: multiple zoom levels

#### Visual parameters

Relative size to main map (5-25%). Corner or floating position. Optional frame and drop shadow. Optional style synchronization.

## 5. Annotations and Drawing

### 5.1 Text annotations

#### Map labels

Manual or automatic placement on entities. Collision avoidance algorithm. Curved labels following lines (rivers, roads). Halos for readability on complex backgrounds.

#### Callouts and bubbles

Predefined shapes (rectangle, ellipse, cloud). Configurable callout arrows. Padding and inner margins. Different border styles.

### 5.2 Geometric shapes

#### Shape library

Basic primitives (line, rectangle, circle, polygon). Complex shapes (arrow, star, hexagon). Import custom SVG shapes. Polygon creation tool.

#### Graphic properties

- Fill color with transparency
- Stroke color and width
- Line styles (solid, dotted, dashed)
- Rounded corners for rectangles
- Free rotation around anchor point

### 5.3 Freehand drawing

#### Drawing tools

Pressure-sensitive brush. Pencil for precise lines. Marker with transparency. Selective eraser.

#### Stroke parameters

- Variable thickness (1-50 px)
- Automatic smoothing (spline)
- Opacity and blend mode
- Stroke texture (solid, pencil, watercolor)

### 5.4 Images and media

#### Image import

Support for JPG, PNG, SVG. Automatic compression if necessary. Resolution detection for print quality. Color profile management.

#### Image manipulation

- Proportional resizing
- Non-destructive cropping
- Opacity adjustment
- Basic filters (B&W, sepia)
- Shape masking

## 6. Composition and Layout

### 6.1 Layer management

#### Element hierarchy

Strict Z-order with stack visualization. Logical grouping of elements. Position/edit lock. Visibility toggle per element.

#### Layer operations

- Move in the stack (forward/backward)
- Duplicate with offset
- Merge layers
- Masking and clipping

### 6.2 Alignment and distribution

#### Alignment tools

Alignment on multi-selection (left, center, right, top, middle, bottom). Alignment to the page or a defined area. Alignment to grid or guides.

#### Spatial distribution

Regular horizontal/vertical spacing. Distribution across total width/height. Offset from edges. Matrix grid layout.

### 6.3 Templates

#### Predefined templates

Collection of standard templates. Categorized by use (print, web, presentation). Substitutable variables (title, source, etc.). Preview before application.

#### Template creation

Save a composition as a template. Mark variable zones. Description and tags for search. Share in a common library.

## 7. Visual Accessibility

### 7.1 Simulation of impairments

#### Color vision filters

Real-time application of simulation filters. Supported types (protanopia, deuteranopia, tritanopia). Variable intensity for partial degrees. Before/after comparison in split view.

#### Other impairments

- Low vision (Gaussian blur)
- Cataract (yellow veil)
- Glaucoma (tunnel vision)
- Reduced contrast

### 7.2 Accessibility optimization

#### Automatic analysis

WCAG contrast checks. Detection of color-dependent information. Suggestion of additional patterns. Overall accessibility score.

#### Suggested improvements

Compliant alternative palettes. Addition of differentiating textures. Increase low contrasts. Text labels for clarification.

## 8. Viewer zoom controls

A unified zoom tool allows independently adjusting the page view or the map view and remains available at all steps for consistent control.
