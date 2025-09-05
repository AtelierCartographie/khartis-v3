import {
  defineConfig,
  minimal2023Preset as preset
} from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headLinkOptions: {
    preset: 'minimal-2023'
  },
  preset,
  images: ['static/logo-khartis.svg']
});
