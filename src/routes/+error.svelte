<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import * as m from '$lib/paraglide/messages';

  // Single-route SPA: any 404 is a stray navigation (e.g. a relative link
  // resolving outside the base path). Send the user back to the map instead of
  // leaving SvelteKit's raw 404 page where the map canvas should be.
  onMount(() => {
    if (page.status === 404) {
      void goto(resolve('/'), { replaceState: true });
    }
  });
</script>

{#if page.status !== 404}
  <div class="route-error" role="alert">
    <p class="route-error-title">{m.error_loading_title()}</p>
    <p class="route-error-subtitle">{m.error_loading_subtitle()}</p>
  </div>
{/if}

<style>
  .route-error {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--cds-spacing-03, 8px);
    padding: 2rem;
    text-align: center;
  }

  .route-error-title {
    font-weight: 600;
  }

  .route-error-subtitle {
    color: var(--cds-text-secondary, #525252);
  }
</style>
