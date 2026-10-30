<script lang="ts">
  import { Close } from 'carbon-icons-svelte';
  import IconButton from './carbon/icon-button.svelte';

  interface Props {
    title: string;
    closeLabel: string;
    onclose: () => void;
  }

  const { title, closeLabel, onclose }: Props = $props();
</script>

<header class="panel-header">
  <h3 class="panel-title">{title}</h3>

  <IconButton
    kind="ghost"
    size="small"
    iconDescription={closeLabel}
    icon={Close}
    onclick={onclose}
  />
</header>

<style>
  /* Shared by the toolbar tool windows and the side panel's floating
     windows, so every window opens on the same title bar. */
  .panel-header {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--cds-spacing-02);
    box-sizing: border-box;
    width: 100%;
    padding: var(--cds-spacing-05) var(--cds-spacing-02) var(--cds-spacing-04)
      var(--cds-spacing-05);
    background-color: inherit;
    border-bottom: 1px solid var(--cds-border-subtle-01, #e0e0e0);
  }

  .panel-title {
    flex: 1 0 0;
    min-width: 0;
    margin: 0;
    font-size: var(--kh-font-primitive);
    font-weight: var(--kh-weight-primitive);
    line-height: var(--kh-line-primitive);
    letter-spacing: 0;
    color: var(--cds-text-01, #161616);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
