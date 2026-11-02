/// <reference types="./lib/types/carbon-components" />

declare global {
  namespace App {}

  interface ImportMetaEnv {
    readonly VITE_APP_VERSION?: string;
    readonly VITE_KHARTIS_ENV?: string;
    readonly VITE_DEBUG?: string;
    readonly VITE_DEBUG_AUTH?: string;
    readonly VITE_LOG_CATEGORIES?: string;
    readonly VITE_LOG_LEVEL?: string;
    readonly VITE_LOG_STACK?: string;
    /** `true` exposes the experimental agent tools through WebMCP. */
    readonly VITE_KHARTIS_AGENT_TOOLS?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    __khartisFlushBeforePwaRecovery?: () => Promise<boolean>;
    /** Dev only: the agent tools, callable from the console. */
    __khartisAgentTools?: {
      list: () => string[];
      call: (name: string, input?: unknown) => Promise<unknown>;
    };
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
