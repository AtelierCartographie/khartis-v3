import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => ({
  worker: {
    format: 'es'
  },
  plugins: [
    sveltekit(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide'
    }),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      workbox: {
        sourcemap: false,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,woff2,woff,ttf,eot,otf,splinecode}'],
        maximumFileSizeToCacheInBytes: 1147483648
      },
      manifest: {
        name: 'Khartis',
        short_name: 'KH',
        display: 'standalone',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        start_url: '/cartographie/khartisnewpprd/?standalone=true',
        scope: '/cartographie/khartisnewpprd/',
        orientation: 'portrait',
        description:
          'Khartis est un outil simple de créations de cartes thématiques. Projections paramétrables - géoréférencement automatique. Un projet open source de Sciences Po - Atelier de cartographie',
        icons: [
          {
            src: '/cartographie/khartisnewpprd/pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png'
          },
          {
            src: '/cartographie/khartisnewpprd/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/cartographie/khartisnewpprd/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/cartographie/khartisnewpprd/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
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
          include: ['src/**/*.{test,spec}.{js,ts}'],
          exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
        }
      }
    ]
  }
}));
