import { registerProcessor } from './processor-registry';
import {
  csvProcessor,
  geojsonProcessor,
  geopackageProcessor,
  geoparquetProcessor,
  gpxProcessor,
  shapefileProcessor
} from './strategies';

let registered = false;

export function registerAllProcessors(): void {
  if (registered) return;

  registerProcessor(csvProcessor);
  registerProcessor(geojsonProcessor);
  registerProcessor(shapefileProcessor);
  registerProcessor(geopackageProcessor);
  registerProcessor(geoparquetProcessor);
  registerProcessor(gpxProcessor);

  registered = true;
}
