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
      <span class="switcher-label">{item}</span>
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
    width: 100%;
    border: 1px solid #cac5c4;
    border-radius: 4px;
    overflow: hidden;
  }

  .switcher-item {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 7px 12px;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 14px;
    font-weight: 400;
    line-height: 18px;
    letter-spacing: 0.16px;
    background: transparent;
    border: none;
    color: var(--cds-text-secondary, #525252);
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;

    &:hover:not(.active) {
      background: var(--cds-layer-hover, #e8e8e8);
    }

    &.active {
      background: #cac5c4;
      color: #161616;
    }
  }

  .switcher-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }

  .switcher-divider {
    width: 1px;
    align-self: stretch;
    background: var(--cds-border-subtle-01);
  }
</style>
