<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Button, Link } from 'carbon-components-svelte';
  import { Edit } from 'carbon-icons-svelte';
  import { mainToolbarActions } from '../main-toolbar.state.svelte';

  function handleNavigateToStyling() {
    mainToolbarActions.navigateToStyling();
  }
</script>

<section class="actions">
  <Button
    kind="primary"
    size="field"
    icon={Edit}
    class="create-btn"
    on:click={handleNavigateToStyling}>{m.create_visualization_button()}</Button
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

    :global(.create-btn) {
      align-items: center;
      gap: var(--cds-spacing-03);
    }

    :global(.create-btn .bx--btn__icon) {
      margin-left: var(--cds-spacing-03);
    }
  }

  .learn-more {
    display: inline-flex;
  }
</style>
