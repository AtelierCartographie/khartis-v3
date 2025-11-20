<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import { Button, Link } from 'carbon-components-svelte';
  import { Edit } from 'carbon-icons-svelte';
</script>

<section class="actions">
  <Button kind="primary" size="lg" icon={Edit} class="create-btn"
    >{m.create_visualization_button()}</Button
  >

  <div class="learn-more">
    <Link href="#" inline size="sm">{m.learn_more_visualizations()}</Link>
  </div>
</section>

<style lang="scss">
  .actions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--cds-spacing-04);
  }

  :global(.create-btn) {
    --btn-height: 48px;
    height: var(--btn-height);
    padding-inline: var(--cds-spacing-06);
  }

  .learn-more {
    display: inline-flex;
  }
</style>
