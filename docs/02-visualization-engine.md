# Visualization Engine

## 1. Visualization Lifecycle

### 1.1 Creating and managing visualizations

Entering the Visualization step automatically creates an initial visualization linked to the imported dataset. Multiple visualizations can be created; each receives a default name with incremental numbering and can be renamed, duplicated, or deleted. The dataset used by a visualization is selectable.

### 1.2 Choosing a visualization

A set of suggested visualizations is proposed based on the profile of the selected data. Each suggestion includes a thumbnail, the graphic primitives involved (symbols, polygons, lines, text), the visualization type (unique values, proportional, classified, categorical) and the variables used. The best match is preselected and rendered on the map; more suggestions can be revealed in batches.

### 1.3 Per-primitive settings

All settings are grouped by graphic primitive. Each primitive can be shown/hidden and filtered with capabilities similar to the data table filters. Depending on the primitive, size, thickness, shape, fill and stroke colors can be defined and often vary by quantitative or qualitative variable.

## 2. Color System

### 2.1 Suggestions and accessibility

Color suggestions are contextual to the data type (qualitative families, sequential palettes) and can be filtered, including a color vision safety filter. Default selections are provided. An intensity section offers darker/lighter variants of a hue. A custom color panel offers hue/saturation/lightness and hex code.

### 2.2 Hatching and patterns

Surfaces can be filled with configurable patterns. The editor exposes shape, angle presets (0°, 45°, 315°), size, and scale.

### 2.3 Sequential and divergent palettes

Users can build sequential palettes from a base color, specify start/end colors, or compose pattern palettes. A palette inversion is available. When a break value is set in classification, a divergent palette is applied with the same customization options.

## 3. Classification

### 3.1 Methods and controls

The user chooses a statistical classification method and the desired number of classes. Methods and references are provided by the project team. A break value can be defined, with a control to position it explicitly.

### 3.2 Visual aids and manual edits

A frequency chart shows class distribution; the user can manually edit bounds. A short definition of the selected method aids selection.

## 4. Basemap customization

### 4.1 Catalog basemaps

Advanced customization with multiple information layers such as land, water, relief, graticules, boundaries, and cities. Each layer can be shown/hidden and styled via dedicated controls. Default values are provided.

### 4.2 Imported basemaps

A reduced set of controls is available: polygon fill, stroke color/width/pattern, line and polygon opacity, and a predefined drop shadow.

### 4.3 OpenStreetMap basemap

Predefined styles, toggles for information layers, and label visibility are provided. Details are defined in annex resources and UI/UX specifications.

## 5. Visualization tools

### 5.1 Search

Search for an entity or value and highlight it on the map, with an attribute tooltip consistent with the Data step.

### 5.2 Layers

Each visualization produces a layer composed of sublayers per primitive and layers linked to the basemap. Layers and sublayers can be shown/hidden, reordered, and provide shortcuts to their settings. Basemap sublayers are shared across visualizations. In collections, layers are grouped by map.

### 5.3 Projections

A default projection is associated with each basemap. A Projections tool proposes suggestions based on geographic extent, with filters for rectangular, rounded, and discontinuous categories. Suggestions can be browsed in list or grid; the list shows them in batches. Each suggestion includes a thumbnail, name, category, optional description, and an “equal-area” label when relevant. The user can also choose from a catalog or paste a CRS defined in WKT or PROJ.4. Parameters (center, rotation, etc.) are available with reset. To preserve fluidity, a simplified preview (temporary hiding of visualizations and optimized rendering) can activate during changes. In collections, the same projection and parameters apply to all maps.

### 5.4 Simplification (generalization)

Catalog basemaps offer three predefined simplification levels associated with dedicated files (low, medium, high). Imported basemaps allow a user-defined simplification rate with a warning about potential geometry loss. OpenStreetMap basemaps are not simplified. With multiple geospatial files, simplification is selectable per file. In collections, the same simplification applies to all maps.

### 5.5 Collections (small multiples)

Collections are sets of maps sharing the same data to facilitate comparison. The user creates a collection by selecting multiple variables for the same primitive; each variable corresponds to a map in the collection. Common-scale or per-map scale principles affect visualization parameters and are defined in the Collection tool. A notification badge prompts configuration. The tool allows defining the layout (number of columns) and distributing variables.

## 6. Rendering and interactivity

### 6.1 Rendering pipeline and optimizations

GPU-accelerated rendering with a composable layer system, culling, and adaptive level of detail. Batching, instancing, texture atlases, and zoom-linked simplification improve performance. Computation caching and progressive loading for large datasets.

### 6.2 Interactions and feedback

Hover and selection with robust picking, tooltips, and highlighting. Panning, animated zoom, and optional globe rotation. Transitions between states, classification animations, and projection morphing ensure continuity. Loading indicators and contextual statuses inform the user.
