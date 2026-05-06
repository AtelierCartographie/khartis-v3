<script lang="ts">
  import { Filter } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    active: boolean;
    count: number;
    onToggle: () => void;
  }

  let { active, count, onToggle }: Props = $props();
</script>

<span class="vfb-wrapper">
  <button
    type="button"
    class="vfb-btn"
    class:vfb-btn--active={active}
    aria-label={m.filter_data()}
    aria-pressed={active}
    onclick={(e: MouseEvent) => {
      e.stopPropagation();
      onToggle();
    }}
  >
    <Filter size={16} />
    {#if count > 0}
      <span class="vfb-badge" aria-hidden="true">{count}</span>
    {/if}
  </button>
</span>

<style lang="scss">
  .vfb-wrapper {
    display: inline-flex;
    align-items: center;
  }

  .vfb-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--cds-icon-secondary);

    &:hover {
      background: var(--cds-layer-hover-01);
      color: var(--cds-icon-primary);
    }

    &:focus-visible {
      outline: 2px solid var(--cds-focus);
      outline-offset: -2px;
    }

    &.vfb-btn--active {
      background: var(--cds-button-secondary, #6f6f6f);
      color: var(--cds-icon-on-color, white);

      &:hover {
        background: var(--cds-button-secondary-hover, #606060);
      }
    }
  }

  .vfb-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    min-width: 12px;
    height: 12px;
    border-radius: 6px;
    padding: 0 2px;
    background: var(--cds-support-error, #da1e28);
    color: white;
    font-size: 8px;
    line-height: 12px;
    text-align: center;
    font-weight: 600;
    pointer-events: none;
  }
</style>
