# Architecture

## Runtime Flow

```
Import → Validation → Parsing → Typing + Stats → Dataset Store → Visualization Suggest → User Configure → Layer Build (Deck.gl) + Basemap (MapLibre) → Layout/Annotations → Export
```

## Core Data Shapes (Simplified)

```ts
interface DataColumn {
  name: string;
  type: ColumnType;
  stats?: ColumnStats;
}
interface ProcessedDataset {
  id: string;
  name: string;
  columns: DataColumn[];
  rowCount: number;
  geometry?: GeometryInfo;
}
interface Visualization {
  id: string;
  datasetId: string;
  type: VizType;
  classification?: Classification;
  color?: ColorConfig;
}
interface Project {
  id: string;
  datasets: ProcessedDataset[];
  visualizations: Visualization[];
  layout: LayoutConfig;
  settings: ProjectSettings;
}
```

## Pillars

- Client-only privacy (IndexedDB + memory)
- Feature-first modularity
- Runes reactive state (explicit mutation methods)
- GPU-first rendering pipeline
- Registry-driven extensibility (viz, color, export, classification, projection)

## Stores Layering

| Layer           | Purpose                     |
| --------------- | --------------------------- |
| Component local | Ephemeral UI state          |
| Feature store   | Canonical domain state      |
| Global store    | Cross-feature coordination  |
| Persistence     | Project snapshot & datasets |

## Performance Anchors

| Concern             | Mitigation                              |
| ------------------- | --------------------------------------- |
| Large imports       | Streaming parse + sample type inference |
| Heavy stats         | Worker offload                          |
| Geometry complexity | Pre-simplified tiers + dynamic LOD      |
| Recompute churn     | $derived memoization + debounce         |

## Failure Principles

Fail fast on invalid input; fallback gracefully (default projection, safe classification); never block UI thread for long tasks (use workers + progress tokens).

## Extensibility Contracts (Sketch)

```ts
type Parser = (file: File) => Promise<RawDataset>;
interface ClassificationStrategy {
  id: string;
  compute(values: number[], k: number): number[];
}
interface Exporter {
  id: string;
  export(project: Project): Promise<Blob>;
}
```

## Security Snapshot

Sanitize filenames & CSV cells, size quotas, dependency audits. Not applicable: CSRF, server auth, multi-tenant isolation.

## Accessibility Snapshot

Keyboard-first navigation, visible focus, contrast-aware palettes, textual summaries for key map stats.

## Internationalization

Paraglide compile-time messages; semantic keys; no runtime string concatenation.

## When To Dive Deeper

| Task              | Detailed Source                          |
| ----------------- | ---------------------------------------- |
| New format        | Data pipeline parsers                    |
| New viz type      | Visualization registry                   |
| Performance audit | Cross-cutting perf section               |
| Undo logic        | State & persistence store implementation |
