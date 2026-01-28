import { registerProcessor } from './processor-registry';
import {
  csvProcessor,
  geojsonProcessor,
  geopackageProcessor,
  geoparquetProcessor,
  shapefileProcessor
} from './strategies';

let registered = false;

export function registerAllProcessors(): void {
  if (registered) return;

  registerProcessor(csvProcessor, 10);
  registerProcessor(geojsonProcessor, 10);
  registerProcessor(shapefileProcessor, 10);
  registerProcessor(geopackageProcessor, 10);
  registerProcessor(geoparquetProcessor, 10);

  registered = true;
}
