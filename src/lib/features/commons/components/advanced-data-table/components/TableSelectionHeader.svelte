<script lang="ts">
  import { Checkbox } from 'carbon-components-svelte';

  interface Props {
    isAllSelected: boolean;
    isIndeterminate?: boolean;
    onToggleAll: () => void;
  }

  const {
    isAllSelected,
    isIndeterminate = false,
    onToggleAll
  }: Props = $props();
</script>

<th class="selection-header">
  <Checkbox
    hideLabel
    checked={isAllSelected}
    indeterminate={isIndeterminate && !isAllSelected}
    on:change={onToggleAll}
    labelText=""
  />
</th>

<style>
  .selection-header {
    width: 52px;
    min-width: 52px;
    max-width: 52px;
    padding: 0 var(--cds-spacing-03);
    text-align: center;
    vertical-align: middle;
    border-bottom: 2px solid var(--cds-ui-03);
    background-color: var(--cds-ui-02);
    position: sticky;
    left: 0;
    z-index: 1;
  }

  .selection-header :global(.bx--form-item) {
    margin: 0;
  }

  .selection-header :global(.bx--checkbox-wrapper) {
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 0 !important;
  }

  .selection-header :global(.bx--checkbox-label) {
    padding: 0;
    min-height: 20px;
  }
</style>
