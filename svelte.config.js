import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { optimizeCss, optimizeImports } from 'carbon-preprocess-svelte';
import { loadEnv } from 'vite';

const isBuild = process.argv.includes('build');
const mode = process.env.NODE_ENV ?? (isBuild ? 'production' : 'development');
const env = loadEnv(mode, process.cwd(), '');

const config = {
  preprocess: [vitePreprocess(), optimizeImports(), optimizeCss()],

  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: true
    }),
    paths: {
      base: env.BASE_PATH || '',
      relative: false
    },
    version: {
      name: env.VITE_APP_VERSION || String(Date.now()),
      pollInterval: 5 * 60 * 1000
    }
  }
};

export default config;
