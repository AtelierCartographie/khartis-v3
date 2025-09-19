<script lang="ts">
  import { Button as CbsButton } from 'carbon-components-svelte';

  let { children } = $props();
</script>

<CbsButton>{@render children()}</CbsButton>
