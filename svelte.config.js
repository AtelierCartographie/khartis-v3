import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { optimizeCss, optimizeImports } from 'carbon-preprocess-svelte';

const config = {
  preprocess: [vitePreprocess(), optimizeImports(), optimizeCss()],

  kit: {
    adapter: adapter({
      fallback: '200.html'
    })
  }
};

export default config;
