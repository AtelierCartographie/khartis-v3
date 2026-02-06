<script lang="ts">
  import InfoPopover from './InfoPopover.svelte';

  interface Props {
    title: string;
    infoText?: string;
  }

  let { title, infoText }: Props = $props();
</script>

<div class="section-heading">
  <span class="section-heading-text">
    {title}
    {#if infoText}
      <InfoPopover text={infoText} />
    {/if}
  </span>
  <div class="section-heading-line"></div>
</div>

<style lang="scss">
  .section-heading {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    margin: var(--cds-spacing-05) 0 var(--cds-spacing-04);

    &:first-child {
      margin-top: 0;
    }
  }

  .section-heading-text {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary);
    white-space: nowrap;
  }

  .section-heading-line {
    flex: 1;
    height: 1px;
    background-color: var(--cds-border-subtle-01);
    min-width: 40px;
  }
</style>
