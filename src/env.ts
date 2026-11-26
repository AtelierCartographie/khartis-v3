import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
  PUBLIC_GTM_CONTAINER_ID: {
    description:
      'Google Tag Manager container of the deployed target, injected by deploy-local.mjs. Empty ships the target without analytics.',
    public: true,
    static: true,
    schema: (value: string | undefined) => value?.trim() ?? ''
  }
});
