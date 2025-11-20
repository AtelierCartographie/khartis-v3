# Troubleshooting Guide

> **Common issues and solutions for Khartis v3 development and usage**

## Table of Contents

- [Installation Issues](#installation-issues)
- [Development Server Problems](#development-server-problems)
- [Data Import Errors](#data-import-errors)
- [Performance Issues](#performance-issues)
- [Visualization Problems](#visualization-problems)
- [Browser Compatibility](#browser-compatibility)
- [Memory Issues](#memory-issues)
- [Build & Deployment](#build--deployment)
- [Debugging Tips](#debugging-tips)

## Installation Issues

### Error: "corepack is not enabled"

**Problem:** Yarn 4 requires corepack to be enabled
```bash
Error: This project is configured to use Yarn 4
```

**Solution:**
```bash
corepack enable
yarn install
```

### Error: "Node version mismatch"

**Problem:** Wrong Node.js version
```bash
Error: The engine "node" is incompatible with this module
```

**Solution:**
```bash
# Check required version in package.json
node --version

# Install correct version using nvm
nvm install 20
nvm use 20
```

### Error: "EACCES permission denied"

**Problem:** Permission issues during installation

**Solution:**
```bash
# Fix npm permissions (DO NOT use sudo)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

## Development Server Problems

### Port 5176 Already in Use

**Problem:**
```bash
Error: Port 5176 is already in use
```

**Solution:**
```bash
# Find and kill process using the port
lsof -i :5176
kill -9 <PID>

# Or use a different port
yarn dev --port 5177
```

### Hot Module Replacement Not Working

**Problem:** Changes not reflected in browser

**Solution:**
1. Clear browser cache
2. Check if file watching is working:
```bash
# Increase file watchers limit (Linux)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Vite Build Errors

**Problem:** Build fails with cryptic errors

**Solution:**
```bash
# Clear Vite cache
rm -rf node_modules/.vite
yarn dev
```

## Data Import Errors

### "File too large" Error

**Problem:** File exceeds 50MB limit
```
Error: File size exceeds maximum limit (50MB)
```

**Solution:**
1. Split the file into smaller chunks
2. Use data sampling for testing
3. Increase limit (not recommended):
```javascript
// src/lib/features/data-pipeline/adapters/validators/size.validator.ts
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
```

### "Invalid CSV format"

**Problem:** CSV parsing fails

**Common Causes & Solutions:**

1. **Encoding issues:**
```bash
# Convert to UTF-8
iconv -f ISO-8859-1 -t UTF-8 input.csv > output.csv
```

2. **Delimiter issues:**
```javascript
// Check if using semicolon instead of comma
// DuckDB auto-detects, but you can force it:
await Duck.query(`
  CREATE TABLE my_table AS
  SELECT * FROM read_csv('file.csv', delim=';')
`);
```

3. **Header issues:**
```bash
# Add headers if missing
echo "col1,col2,col3" | cat - data.csv > temp && mv temp data.csv
```

### "Geometry parsing failed"

**Problem:** GeoJSON/Shapefile import fails

**Solutions:**

1. **Validate geometry:**
```bash
# Using ogr2ogr
ogr2ogr -f GeoJSON validated.json input.json -dialect sqlite -sql "SELECT * FROM input WHERE ST_IsValid(geometry)"
```

2. **Fix invalid geometry:**
```sql
-- In DuckDB after import
UPDATE table_name
SET geometry = ST_MakeValid(geometry)
WHERE NOT ST_IsValid(geometry);
```

3. **Check projection:**
```bash
# Reproject to WGS84
ogr2ogr -t_srs EPSG:4326 output.json input.json
```

### "Type inference failed"

**Problem:** Columns detected as wrong type

**Solution:**
```javascript
// Force type in processing
const result = await Duck.query(`
  SELECT
    CAST(column AS INTEGER) as column
  FROM ${tableName}
`);
```

## Performance Issues

### Slow File Processing

**Problem:** Large files take too long to process

**Solutions:**

1. **Use sampling for preview:**
```javascript
// Only process first 1000 rows for preview
const preview = await Duck.query(`
  SELECT * FROM ${tableName}
  USING SAMPLE 1000 ROWS
`);
```

2. **Enable Web Workers:**
   - Check workers are enabled in browser
   - Verify SharedArrayBuffer support

3. **Optimize queries:**
```sql
-- Use indexes for joins
CREATE INDEX idx_id ON table1(id);
```

### UI Freezing During Operations

**Problem:** Browser becomes unresponsive

**Solutions:**

1. **Use background processing:**
```javascript
// Move to worker
const worker = new Worker('./processor.worker.js');
worker.postMessage({ data });
```

2. **Add progress feedback:**
```javascript
// Show progress bar
progressStore.update(0.5, 'Processing...');
```

3. **Chunk large operations:**
```javascript
// Process in batches
for (let i = 0; i < data.length; i += 1000) {
  await processChunk(data.slice(i, i + 1000));
  await new Promise(r => setTimeout(r, 0)); // Yield to UI
}
```

### Memory Leaks

**Problem:** Memory usage keeps growing

**Debugging:**
```javascript
// Monitor memory
console.log('Memory:', performance.memory.usedJSHeapSize / 1048576, 'MB');

// Force garbage collection (Chrome DevTools)
// Run with --expose-gc flag
if (global.gc) global.gc();
```

**Solutions:**

1. **Clean up DuckDB tables:**
```javascript
// Drop unused tables
await Duck.query(`DROP TABLE IF EXISTS temp_table`);
```

2. **Clear stores on unmount:**
```javascript
onDestroy(() => {
  datasetStore.clear();
  visualizationStore.reset();
});
```

## Visualization Problems

### Map Not Rendering

**Problem:** Blank map or layers not showing

**Checklist:**
1. Check browser console for errors
2. Verify MapLibre GL JS loaded
3. Check basemap URL is accessible
4. Verify Deck.gl initialization

**Debug:**
```javascript
// Check map instance
console.log('Map loaded:', map.loaded());
console.log('Layers:', map.getStyle().layers);
```

### Incorrect Colors

**Problem:** Colors don't match palette

**Solutions:**

1. **Check color space:**
```javascript
// Ensure RGB values are 0-255
const rgb = [r * 255, g * 255, b * 255];
```

2. **Verify classification:**
```javascript
// Check breaks calculation
console.log('Breaks:', breaks);
console.log('Values range:', min, max);
```

### Performance with Many Features

**Problem:** Map slow with >10k features

**Solutions:**

1. **Enable clustering:**
```javascript
new deck.GeoJsonLayer({
  id: 'clustered',
  data: features,
  clusterRadius: 50,
  clusterMaxZoom: 14
});
```

2. **Use vector tiles:**
```javascript
// Convert to MVT for large datasets
new deck.MVTLayer({
  data: 'https://tiles.example.com/{z}/{x}/{y}.mvt'
});
```

3. **Implement LOD (Level of Detail):**
```javascript
// Simplify based on zoom
const tolerance = zoom < 10 ? 0.01 : 0.001;
const simplified = simplify(geometry, tolerance);
```

## Browser Compatibility

### "WebAssembly not supported"

**Problem:** DuckDB requires WASM

**Affected Browsers:**
- IE 11 (no support)
- Safari < 11 (no support)
- Chrome < 57 (no support)

**Solution:** Show compatibility message:
```javascript
if (!window.WebAssembly) {
  alert('Your browser does not support WebAssembly. Please update to a modern browser.');
}
```

### "SharedArrayBuffer not available"

**Problem:** Required for optimal Worker performance

**Solution:** Add required headers:
```javascript
// vite.config.js
export default {
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  }
}
```

### PWA Not Installing

**Problem:** "Add to Home Screen" not working

**Checklist:**
1. HTTPS required (except localhost)
2. Valid manifest.json
3. Service worker registered
4. Icons provided (192px, 512px)

## Memory Issues

### "Out of Memory" Error

**Problem:** Browser tab crashes

**Solutions:**

1. **Reduce dataset size:**
```sql
-- Sample large datasets
CREATE TABLE sampled AS
SELECT * FROM large_table
USING SAMPLE 10000 ROWS;
```

2. **Clear unused data:**
```javascript
// Free memory explicitly
dataset = null;
await Duck.query(`DROP TABLE ${oldTable}`);
```

3. **Increase browser memory:**
```bash
# Chrome with more memory
google-chrome --max-old-space-size=4096
```

### IndexedDB Quota Exceeded

**Problem:** Cannot save projects

**Solutions:**

1. **Check quota usage:**
```javascript
const estimate = await navigator.storage.estimate();
console.log(`Using ${estimate.usage} of ${estimate.quota} bytes`);
```

2. **Clear old projects:**
```javascript
await projectStore.deleteOldProjects(30); // Delete >30 days old
```

3. **Request persistent storage:**
```javascript
if (navigator.storage.persist) {
  const isPersisted = await navigator.storage.persist();
}
```

## Build & Deployment

### Build Fails

**Problem:** `yarn build` errors

**Common fixes:**

1. **Type errors:**
```bash
# Check types first
yarn check

# Fix type errors
yarn tsc --noEmit
```

2. **Import errors:**
```javascript
// Use proper imports
import { feature } from '$lib/features/feature';
// Not: import feature from '$lib/features/feature';
```

3. **Memory issues during build:**
```bash
# Increase Node memory
NODE_OPTIONS="--max-old-space-size=4096" yarn build
```

### Deployment Issues

**Problem:** App doesn't work when deployed

**Checklist:**

1. **Base path configuration:**
```javascript
// svelte.config.js
export default {
  kit: {
    paths: {
      base: '/subdirectory' // If not at root
    }
  }
};
```

2. **Environment variables:**
```bash
# .env.production
PUBLIC_API_URL=https://production.api.com
```

3. **CORS headers:**
```nginx
# nginx.conf
add_header Cross-Origin-Embedder-Policy "require-corp";
add_header Cross-Origin-Opener-Policy "same-origin";
```

## Debugging Tips

### Enable Debug Mode

```javascript
// Set in localStorage
localStorage.setItem('debug', 'true');

// Or via URL
http://localhost:5176?debug=true
```

### Performance Profiling

```javascript
// Measure operation time
console.time('import');
await dataPipeline.processFile(file);
console.timeEnd('import');

// Profile rendering
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log(`${entry.name}: ${entry.duration}ms`);
  }
});
observer.observe({ entryTypes: ['measure'] });
```

### DuckDB Query Debugging

```javascript
// Enable query logging
Duck.debug = true;

// Explain query plan
const plan = await Duck.query(`
  EXPLAIN ANALYZE
  SELECT * FROM table WHERE condition
`);
console.log(plan);
```

### Memory Profiling

1. Open Chrome DevTools
2. Go to Memory tab
3. Take heap snapshot
4. Perform operation
5. Take another snapshot
6. Compare snapshots

### Network Debugging

```javascript
// Monitor fetch requests
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  console.log('Fetch:', args);
  const response = await originalFetch(...args);
  console.log('Response:', response.status);
  return response;
};
```

## Getting Help

### Before Asking for Help

1. **Check the console** for errors
2. **Read the error message** carefully
3. **Search existing issues** on GitHub
4. **Try the solution** in this guide
5. **Create a minimal reproduction**

### Reporting Issues

Include:
- Browser and version
- OS and version
- Steps to reproduce
- Error messages
- Sample data (if applicable)

**Template:**
```markdown
## Environment
- Browser: Chrome 119
- OS: Ubuntu 22.04
- Khartis version: 3.1.0

## Steps to Reproduce
1. Import CSV file
2. Select choropleth visualization
3. Error appears

## Error Message
```
Error: Cannot read property 'geometry' of undefined
```

## Sample Data
[Attach small sample file]
```

### Support Channels

- **GitHub Issues**: [github.com/khartis/khartis-v3/issues](https://github.com/khartis/khartis-v3/issues)
- **Discord**: [discord.gg/khartis](https://discord.gg/khartis)
- **Documentation**: [/docs](./README.md)

---

**Last Updated**: 2025-11-20
**Version**: 3.1.0