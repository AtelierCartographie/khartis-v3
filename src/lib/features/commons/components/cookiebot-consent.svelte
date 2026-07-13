<script lang="ts">
  import { onMount } from 'svelte';
  import { analyticsService } from '$lib/features/commons/services/analytics.service';
  import { subscribeToCookiebotConsent } from '$lib/features/commons/services/cookiebot-consent.service';

  onMount(() => {
    analyticsService.initialize();

    const unsubscribe = subscribeToCookiebotConsent((analyticsAllowed) => {
      if (analyticsAllowed) {
        analyticsService.enable();
      } else {
        analyticsService.disable();
      }
    });

    return () => {
      unsubscribe();
      analyticsService.disable();
    };
  });
</script>
