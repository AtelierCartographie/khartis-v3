import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { optimizeCss, optimizeImports } from 'carbon-preprocess-svelte';

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
      base:
        process.env.NODE_ENV === 'production'
          ? '/cartographie/khartisnewpprd'
          : ''
    }
  }
};

export default config;
