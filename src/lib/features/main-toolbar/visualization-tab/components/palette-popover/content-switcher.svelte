<script lang="ts">
  interface Props {
    items: string[];
    activeIndex?: number;
    onchange?: (index: number) => void;
  }

  let { items, activeIndex = 0, onchange }: Props = $props();
</script>

<div class="content-switcher" role="tablist">
  {#each items as item, i (i)}
    <button
      type="button"
      class="switcher-item"
      class:active={activeIndex === i}
      role="tab"
      aria-selected={activeIndex === i}
      onclick={() => onchange?.(i)}
    >
      {item}
    </button>
    {#if i < items.length - 1 && activeIndex !== i && activeIndex !== i + 1}
      <div class="switcher-divider"></div>
    {/if}
  {/each}
</div>

<style lang="scss">
  .content-switcher {
    display: flex;
    align-items: stretch;
    border: 1px solid #cac5c4;
    border-radius: 4px;
    overflow: hidden;
  }

  .switcher-item {
    flex: 1;
    padding: 7px 16px;
    font-size: 14px;
    line-height: 18px;
    letter-spacing: 0.16px;
    font-family: 'IBM Plex Sans', sans-serif;
    background: transparent;
    border: none;
    color: var(--cds-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;

    &:hover:not(.active) {
      background: var(--cds-layer-hover);
    }

    &.active {
      background: #cac5c4;
      color: var(--cds-text-primary);
    }
  }

  .switcher-divider {
    width: 1px;
    align-self: stretch;
    background: #cac5c4;
  }
</style>
