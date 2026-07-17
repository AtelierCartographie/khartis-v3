import {
  createReadStream,
  existsSync,
  readFileSync,
  realpathSync,
  statSync
} from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

const crossOriginIsolationAssets = (): Plugin => ({
  name: 'cross-origin-isolation-assets',
  configurePreviewServer(server) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    });
  }
});

const TEST_DATASET_CONTENT_TYPES: Record<string, string> = {
  '.csv': 'text/csv; charset=utf-8',
  '.geojson': 'application/geo+json',
  '.gpx': 'application/gpx+xml',
  '.json': 'application/json',
  '.kml': 'application/vnd.google-earth.kml+xml',
  '.kmz': 'application/vnd.google-earth.kmz',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip'
};

const serveTestDatasets = (basePath: string): Plugin => ({
  name: 'serve-test-datasets',
  apply: 'serve',
  configureServer(server) {
    const normalizedBasePath = basePath
      ? `/${basePath.replace(/^\/+|\/+$/g, '')}`
      : '';
    const routePrefixes = [
      '/tests-datasets/',
      ...(normalizedBasePath ? [`${normalizedBasePath}/tests-datasets/`] : [])
    ];
    const root = realpathSync(resolve(process.cwd(), 'tests-datasets'));

    server.middlewares.use((request, response, next) => {
      if (!request.url || !['GET', 'HEAD'].includes(request.method ?? '')) {
        next();
        return;
      }

      let pathname: string;
      try {
        pathname = decodeURIComponent(
          new URL(request.url, 'http://localhost').pathname
        );
      } catch {
        next();
        return;
      }
      const routePrefix = routePrefixes.find((prefix) =>
        pathname.startsWith(prefix)
      );
      if (!routePrefix) {
        next();
        return;
      }

      try {
        const filePath = realpathSync(
          resolve(root, pathname.slice(routePrefix.length))
        );
        if (
          !filePath.startsWith(`${root}${sep}`) ||
          !statSync(filePath).isFile()
        ) {
          next();
          return;
        }

        const stats = statSync(filePath);
        response.statusCode = 200;
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Length', stats.size);
        response.setHeader(
          'Content-Type',
          TEST_DATASET_CONTENT_TYPES[extname(filePath).toLowerCase()] ??
            'application/octet-stream'
        );
        if (request.method === 'HEAD') {
          response.end();
          return;
        }

        createReadStream(filePath)
          .on('error', (error) => response.destroy(error))
          .pipe(response);
      } catch {
        next();
      }
    });
  }
});

const dropWoffFallback = (): Plugin => ({
  name: 'drop-woff-fallback',
  apply: 'build',
  generateBundle(_options, bundle) {
    const woffFallbackPattern =
      /,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g;
    for (const [fileName, asset] of Object.entries(bundle)) {
      if (asset.type !== 'asset') continue;
      if (fileName.endsWith('.woff')) {
        delete bundle[fileName];
        continue;
      }
      if (fileName.endsWith('.css')) {
        const original =
          typeof asset.source === 'string'
            ? asset.source
            : new TextDecoder().decode(asset.source as Uint8Array);
        const next = original.replace(woffFallbackPattern, '');
        if (next !== original) {
          asset.source = next;
        }
      }
    }
  }
});

// Carbon's `css/all.css` ships @font-face for IBM Plex (Sans/Mono/Serif) pointing at the
// IBM CDN (1.www.s81c.com). Plex Sans is self-hosted via @fontsource (see fonts.css); Plex
// Mono (used by the data-paste textarea) and Serif (unused) fall back to the system
// monospace/serif stacks Carbon already declares. Dropping every CDN @font-face keeps the
// app offline-capable (PWA), removes ~28 third-party requests at cold start, and stops
// leaking the client IP to IBM — including while the user is pasting their own data.
const dropCarbonCdnFonts = (): Plugin => ({
  name: 'drop-carbon-cdn-fonts',
  apply: 'build',
  generateBundle(_options, bundle) {
    const cdnFontFace = /@font-face\s*\{[^{}]*s81c\.com[^{}]*\}/g;
    for (const [fileName, asset] of Object.entries(bundle)) {
      if (asset.type !== 'asset' || !fileName.endsWith('.css')) continue;
      const original =
        typeof asset.source === 'string'
          ? asset.source
          : new TextDecoder().decode(asset.source as Uint8Array);
      const next = original.replace(cdnFontFace, '');
      if (next !== original) {
        asset.source = next;
      }
    }
  }
});

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const verifyServiceWorkerPrecache = (basePath: string): Plugin => ({
  name: 'verify-sw-precache',
  apply: 'build',
  closeBundle: {
    sequential: true,
    order: 'post',
    handler() {
      const navigationFallbackUrl = basePath ? `${basePath}/` : '/';
      const candidates = [
        resolve(process.cwd(), '.svelte-kit/output/client/sw.js'),
        resolve(process.cwd(), 'build/sw.js')
      ];
      const swPath = candidates.find((path) => existsSync(path));
      if (!swPath) return;
      const content = readFileSync(swPath, 'utf8');
      const hasNavigationFallbackInPrecache = new RegExp(
        `["']?url["']?:["']${escapeRegExp(navigationFallbackUrl)}["']`
      ).test(content);
      if (!hasNavigationFallbackInPrecache) {
        throw new Error(
          `[verify-sw-precache] ${swPath} does not precache ${navigationFallbackUrl} — refusing to ship a broken Service Worker. Check VitePWA injectManifest.globPatterns and additionalManifestEntries.`
        );
      }
    }
  }
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = env.BASE_PATH || '';

  return {
    css: {
      preprocessorOptions: {
        scss: {
          loadPaths: ['node_modules'],
          quietDeps: true,
          silenceDeprecations: [
            'import',
            'global-builtin',
            'color-functions',
            'slash-div',
            'if-function'
          ]
        }
      }
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless'
      }
    },
    build: {
      target: 'esnext',
      chunkSizeWarningLimit: 3000,
      sourcemap: mode !== 'production',
      rolldownOptions: {
        checks: {
          pluginTimings: false
        }
      }
    },
    optimizeDeps: {
      include: [
        '@duckdb/duckdb-wasm',
        'maplibre-gl',
        '@deck.gl/core',
        '@deck.gl/layers',
        'apache-arrow'
      ],
      exclude: ['parquet-wasm', '@sqlite.org/sqlite-wasm']
    },
    plugins: [
      process.env.ANALYZE === 'true' &&
        visualizer({
          filename: 'bundle-stats.html',
          gzipSize: true,
          brotliSize: true,
          template: 'treemap'
        }),
      serveTestDatasets(basePath),
      sveltekit(),
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/lib/paraglide',
        emitTsDeclarations: true
      }),
      crossOriginIsolationAssets(),
      dropWoffFallback(),
      dropCarbonCdnFonts(),
      verifyServiceWorkerPrecache(basePath),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon-180x180.png',
          'maskable-icon-512x512.png'
        ],
        registerType: 'prompt',
        injectRegister: false,
        devOptions: {
          enabled: true,
          type: 'module'
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html}', 'manifest.webmanifest'],
          globIgnores: [
            '**/node_modules/**/*',
            'basemaps/**',
            'screenshots/**',
            'duckdb-extensions/**'
          ],
          additionalManifestEntries: [
            {
              url: basePath ? `${basePath}/` : '/',
              revision: `${Date.now()}`
            }
          ],
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024
        },
        manifest: {
          id: basePath ? `${basePath}/` : '/',
          name: 'Khartis',
          short_name: 'KH',
          display: 'standalone',
          display_override: [
            'window-controls-overlay',
            'standalone',
            'browser'
          ],
          theme_color: '#ffffff',
          background_color: '#ffffff',
          start_url: `${basePath}/?standalone=true`,
          scope: `${basePath}/`,
          lang: 'fr',
          orientation: 'portrait',
          categories: ['productivity', 'education', 'graphics'],
          description:
            'Khartis est un outil simple de créations de cartes thématiques. Projections paramétrables - géoréférencement automatique. Un projet open source de Sciences Po - Atelier de cartographie',
          screenshots: [
            {
              src: `${basePath}/screenshots/welcome.png`,
              sizes: '1280x720',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Accueil et démarrage de Khartis'
            },
            {
              src: `${basePath}/screenshots/visualization.png`,
              sizes: '1280x720',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Configuration des visualisations'
            },
            {
              src: `${basePath}/screenshots/styling.png`,
              sizes: '1280x720',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Personnalisation de la carte'
            }
          ],
          icons: [
            {
              src: `${basePath}/pwa-64x64.png`,
              sizes: '64x64',
              type: 'image/png'
            },
            {
              src: `${basePath}/pwa-192x192.png`,
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: `${basePath}/pwa-512x512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: `${basePath}/maskable-icon-512x512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        }
      })
    ],
    // Web Worker configuration
    worker: {
      format: 'es' as const,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].worker.js'
        }
      }
    },
    test: {
      projects: [
        {
          extends: './vite.config.ts',
          plugins: [svelteTesting()],
          test: {
            name: 'client',
            environment: 'jsdom',
            clearMocks: true,
            include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
            exclude: ['src/lib/server/**'],
            setupFiles: ['./vitest-setup-client.ts']
          }
        },
        {
          extends: './vite.config.ts',
          test: {
            name: 'server',
            environment: 'node',
            include: [
              'tests/pipeline/**/*.{test,spec}.{js,ts}',
              'tests/duckdb/**/*.{test,spec}.{js,ts}'
            ],
            exclude: ['tests/**/tmp-*.{test,spec}.{js,ts}'],
            setupFiles: ['./vitest-setup-server.ts'],
            pool: 'forks',
            fileParallelism: false
          }
        }
      ]
    }
  };
});
