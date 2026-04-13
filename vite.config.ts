import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { createLogger, defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = env.BASE_PATH || '';
  const baseLogger = createLogger();
  const ignoredWarningPatterns = [
    /Unknown output options: codeSplitting/,
    /"spawn" is not exported by "__vite-browser-external"/
  ];

  return {
    customLogger: {
      ...baseLogger,
      warn(message, options) {
        if (ignoredWarningPatterns.some((pattern) => pattern.test(message))) {
          return;
        }
        baseLogger.warn(message, options);
      },
      warnOnce(message, options) {
        if (ignoredWarningPatterns.some((pattern) => pattern.test(message))) {
          return;
        }
        baseLogger.warnOnce(message, options);
      }
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      }
    },
    build: {
      target: 'esnext',
      chunkSizeWarningLimit: 3000
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
      {
        name: 'font-display-swap',
        generateBundle(_, bundle) {
          for (const chunk of Object.values(bundle)) {
            if (chunk.type === 'asset' && chunk.fileName.endsWith('.css')) {
              chunk.source = (chunk.source as string).replaceAll(
                'font-display:auto',
                'font-display:swap'
              );
            }
          }
        }
      },
      sveltekit(),
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/lib/paraglide'
      }),
      VitePWA({
        registerType: 'prompt',
        devOptions: {
          enabled: true,
          type: 'module'
        },
        workbox: {
          sourcemap: false,
          globPatterns:
            process.env.NODE_ENV === 'production'
              ? [
                  '**/*.{js,css,html,ico,png,svg,woff2,woff,ttf,eot,otf}',
                  'duckdb-extensions/**/*.wasm',
                  'basemaps/all-basemaps-metadata.json',
                  'basemaps/all-basemaps-attributes.parquet'
                ]
              : [],
          globIgnores: ['**/node_modules/**/*'],
          navigateFallback: basePath ? `${basePath}/index.html` : '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /\.[^/]+$/],
          maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: /.*duckdb.*\.wasm$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'duckdb-wasm-core',
                expiration: {
                  maxEntries: 5,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                },
                matchOptions: {
                  ignoreSearch: true
                }
              }
            },
            {
              urlPattern: /^https:\/\/extensions\.duckdb\.org\/.*/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'duckdb-extensions-cdn',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /\/duckdb-extensions\/.*\.wasm$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'duckdb-extensions-local',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /\/basemaps\/.*\.(parquet|geojson|json)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'basemaps-data',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /.*\.worker\.js$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'workers',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 90
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern:
                /^https:\/\/(tile\.openstreetmap\.org|tile-[abc]\.openstreetmap\.fr|tile\.thunderforest\.com)\/.*/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'osm-tiles',
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 60 * 60 * 24 * 90
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/basemaps\.cartocdn\.com\/.*/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'carto-tiles',
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 60 * 60 * 24 * 90
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'openfreemap-tiles',
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 60 * 60 * 24 * 90
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'images',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        manifest: {
          name: 'Khartis',
          short_name: 'KH',
          display: 'standalone',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          start_url: `${basePath}/?standalone=true`,
          scope: `${basePath}/`,
          orientation: 'portrait',
          description:
            'Khartis est un outil simple de créations de cartes thématiques. Projections paramétrables - géoréférencement automatique. Un projet open source de Sciences Po - Atelier de cartographie',
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
            exclude: ['tests/e2e/**'],
            pool: 'threads',
            fileParallelism: false
          }
        }
      ]
    }
  };
});
