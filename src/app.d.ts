/// <reference types="./lib/types/carbon-components" />

declare global {
  namespace App {}

  interface ImportMetaEnv {
    readonly VITE_APP_VERSION?: string;
    readonly VITE_DEBUG?: string;
    readonly VITE_DEBUG_AUTH?: string;
    readonly VITE_LOG_CATEGORIES?: string;
    readonly VITE_LOG_LEVEL?: string;
    readonly VITE_LOG_STACK?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

declare module '@tmcw/togeojson' {
  import type { FeatureCollection } from 'geojson';

  export function kml(
    document: Document,
    options?: { styles?: boolean }
  ): FeatureCollection;
}

export {};
