import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { optimizeCss, optimizeImports } from 'carbon-preprocess-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess(), optimizeImports(), optimizeCss()],

	kit: {
		adapter: adapter({
			fallback: '200.html'
		})
	}
};

export default config;
