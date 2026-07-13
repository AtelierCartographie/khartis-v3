<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { openCookiebotSettings } from '$lib/features/commons/services/cookiebot-consent.service';
  import { Button } from 'carbon-components-svelte';
  import { Information } from 'carbon-icons-svelte';

  function openConsentSettings(): void {
    openCookiebotSettings();
  }
</script>

<Button
  size="small"
  kind="ghost"
  icon={Information}
  class="menu-bar-item"
  data-testid="sidenav-cookie-consent"
  on:click={openConsentSettings}
>
  {m.sidenav_cookie_consent()}
</Button>

<style>
  :global(#CookiebotWidget) {
    display: none !important;
  }
</style>
