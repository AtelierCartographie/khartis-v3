# Khartis Pipeline

Khartis Pipeline is a lightweight wrapper around DuckDB WASM, designed to simplify data processing and analysis for Khartis use cases. It provides a high-level API to handle geospatial and tabular data, perform advanced data analysis, and generate visualizations. While the core functionality is focused on data manipulation, the project also includes a web-based interface built with Svelte for testing and demonstration purposes.

By leveraging DuckDB's powerful in-browser capabilities, Khartis Pipeline enables seamless data handling without the need for server-side processing, making it ideal for interactive and client-side applications.

## Features

- **Data Upload and Management**: Upload datasets and manage them using DuckDB.
- **Visualization Suggestions**: Automatically generate visualization suggestions based on data analysis and semiological typing.
- **Geospatial Support**: Handle geospatial data with tools like `geoparquet.js` and spatial visualization components.
- **Interactive Tables**: Display and interact with large datasets using infinite scrolling and summary plots.
- **Data Analysis**: Perform advanced data analysis with tools like `analyse.js` and `breaks.js`.

## File Overview

- **`geoparquet.js`**: Handles geospatial data in the GeoParquet format.
- **`Map.svelte`**: A Svelte component for rendering interactive maps.
- **`projscreen.js`**: Provides projection and screen transformation utilities.
- **`share_state.svelte.js`**: Manages shared state across components.
- **`Table.svelte`**: Displays tabular data with infinite scrolling and row highlighting.
- **`Upload.svelte`**: A component for uploading datasets into the application.
- **`viz_suggestions.js`**: Suggests visualizations based on dataset analysis and geometry type.
- **`VizSuggestions.svelte`**: A Svelte component for displaying visualization suggestions.
- **`duckdb/`**:
  - **`analyse.js`**: Analyzes datasets to extract column metadata and statistics.
  - **`breaks.js`**: Provides utilities for calculating data breaks (e.g., quantiles).
  - **`duckdb.js`**: Interfaces with DuckDB for data querying and manipulation.
  - **`join.js`**: Handles table joins and related operations.
  - **`summary-plot.js`**: Generates summary plots for data visualization.
  - **`SummaryPlot.svelte`**: A Svelte component for rendering summary plots.

## Getting Started

### Prerequisites

- Node.js (v16 or later)
- npm, pnpm, or yarn

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-repo/khartis-pipeline.git
cd khartis-pipeline
pnpm install
```

### Development

Start the development server:

```bash
pnpm run dev

# or start the server and open the app in a new browser tab
pnpm run dev -- --open
```

### Building

Create a production build:

```bash
pnpm run build
```

Preview the production build:

```bash
pnpm run preview
```

## Usage

1. **Upload Data**: Use the `Upload` component to upload datasets.
2. **Analyze Data**: The application automatically analyzes datasets using DuckDB.
3. **View Tables**: Explore datasets in the `Table` component with infinite scrolling.
4. **Generate Visualizations**: View visualization suggestions in the `VizSuggestions` component.
5. **Customize Visualizations**: Use tools like `SummaryPlot` to create custom visualizations.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any feature requests or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
