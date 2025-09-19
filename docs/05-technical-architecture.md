# Technical Architecture

## 1. Overall architecture

### 1.1 Application architecture

An MVVM-like model adapted to Svelte ensures a clear separation of concerns. The presentation layer is built with Svelte components, logic with domain services, data with an embedded database and reactive state, and rendering with GPU-accelerated mapping. Data flows are unidirectional and centralized in state, with derived values computed reactively.

### 1.2 Technology stack

- Main framework: SvelteKit 5 in Runes mode, single-page app with client-side routing and optimized Vite build
- Embedded database: DuckDB WASM with spatial extension for SQL and geospatial operations in the browser
- Rendering: Deck.gl for performant WebGL visualizations and a composable layer system
- Utilities: D3 for projections and layout aids; Chroma.js for palette generation; Observable Plot for inline charts in the UI when needed
- Design system: IBM Carbon components, themed and extended as needed

### 1.3 Build and delivery

Vite ensures route-level code splitting, tree-shaking, and compression. Development uses hot-module replacement. Production bundles prioritize critical resources and preloads. A service worker can cache static assets for offline resilience when appropriate.

## 2. State and data processing

### 2.1 State management

A small set of reactive stores maintains application, data, visualization, and layout state. Side effects are isolated. Mutations happen via explicit actions and computed values are derived to keep rendering efficient.

### 2.2 Data processing pipeline

The pipeline covers import and validation, typing and statistics, cleaning and normalization, enrichment via joins, indexing and caching. Large files are handled by streaming and pagination. Memory is monitored and proactively freed to preserve UI responsiveness.

### 2.3 Web Workers

Heavy computations run in background tasks. Transferable objects minimize copies. In the absence of support, the system gracefully degrades while maintaining interactive responsiveness.

## 3. Rendering architecture

### 3.1 Deck.gl integration

Rendering relies on composable layers that react to state changes. Interactivity is implemented via GPU picking. Transitions animate changes in data, classification, and projections to preserve context.

### 3.2 WebGL optimizations

Batching, instancing, texture atlases, and adaptive level of detail improve performance. Projection and geometry calculations are cached. Progressive rendering and simplified previews preserve fluidity during parameter changes.

## 4. Performance and monitoring

### 4.1 Loading strategy

Code is split by route and heavy libraries are loaded on demand. Critical resources are preloaded. Fonts and images are optimized and skeleton screens from the design system reduce perceived latency during long operations.

### 4.2 Runtime goals

Goals include fast initial display, short time-to-interactive, stable layout, and 60 FPS interactions/animations on typical devices. Performance budgets cap initial JavaScript, CSS, fonts, and images.

### 4.3 Observability

Browser performance APIs, custom events, and error reporting provide visibility. RUM monitoring and synthetic audits can be integrated to detect regressions over time.

## 5. Platform and compliance

### 5.1 Compatibility

Supported browsers: recent versions of Chrome, Firefox, Edge, and Safari on desktop and mobile. The app adapts to screen sizes and orientations, following responsive layouts defined by UI/UX specifications.

### 5.2 Accessibility

The tool targets RGAA/WCAG compliance, including keyboard navigation, contrast, focus visibility, and assistive semantics. Given the complexity of maps and statistical charts, full screen-reader equivalence is not always possible; alternative cues and summaries are provided where feasible.

### 5.3 Keyboard shortcuts

Keyboard access covers main steps and major tools. Common actions (save, export, select, delete) have standard shortcuts. Escape consistently cancels or closes panels. The complete list is documented with the UI.

### 5.4 Internationalization

The interface is available in French and English. Language is detected from system or browser and can be changed in the menu. Translations are compiled at build time, typed, and can be updated independently.

### 5.5 Analytics

An audience measurement solution (e.g., Google Analytics) can be integrated. Collection is minimized and configurable to meet privacy requirements.

### 5.6 Security and data protection

Imported tabular and geospatial data remain confined to the browser and are not transmitted to servers. Only telemetry and site content may involve network requests. Cookies and browsing data are handled per GDPR, with transparent policies and user control.

## 6. Deployment and operations

### 6.1 Hosting

The application is hosted on Sciences Po infrastructure for stability, security, and performance, with an external hosting option if needed. Source code resides in a dedicated GitHub repository in the organization, private during development then opened at release.

### 6.2 Environments and release

Two environments are maintained: preproduction for testing and final validation, and production for general availability. Promotion follows a versioned, documented deployment process after preproduction validation.

### 6.3 Continuous integration

CI builds, tests, and analyzes each change. Accessibility checks, multi-browser tests, and performance budgets are applied in CI to prevent regressions.

### 6.4 License

The project is distributed under the MIT license. Copies and distributions must include the license text and copyright notice.

© Atelier de cartographie / Sciences Po, 2025

## 7. UI/UX integration

### 7.1 Design system and prototypes

Carbon components are themed to match the brand. Custom components are created when needed for specialized interactions. Figma files provide the component library, interface structure, exhaustive settings, and an interactive prototype of the flow. These artifacts guide implementation and ensure consistency across screens.

## 8. Notes for developers

### 8.1 Code documentation

Documentation is maintained in the `docs/` directory. Code follows clean code principles with self-documenting names. Comments are only added when explicitly requested. See [Features Architecture](14-features-architecture.md) for implementation details.

### 8.2 Extensibility points

- Variable typing: initial algorithm provided by the Atelier. The system should allow overrides and evolution without breaking the UI; users can always correct manually.
- Projection catalog: allow adding WKT/PROJ.4 definitions and metadata without code changes when possible.
- Join assistant: keep matching/scoring strategy configurable to integrate other datasets and heuristics.
- Export formats: maintain a registry to add formats or adjust presets while preserving backward compatibility.

### 8.3 External pages and help

The home page, legal notices, help, and examples are written by the Atelier and outside the core app. Provide clean integration points (routes, links, placements) to connect them without altering the core.

### 8.4 Maintenance and evolution

Plan corrective and evolutionary maintenance starting in 2026. Track dependencies and security updates, and schedule regular audits. Preserve migration notes for data formats and project versions to ease future upgrades.
