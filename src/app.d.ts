/// <reference types="./lib/types/carbon-components" />

declare global {
  namespace App {}
}

declare module '@tmcw/togeojson' {
  import type { FeatureCollection } from 'geojson';

  export function kml(
    document: Document,
    options?: { styles?: boolean }
  ): FeatureCollection;
}

export {};
