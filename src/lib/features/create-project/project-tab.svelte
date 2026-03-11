<script lang="ts">
  import { RadioButton } from 'carbon-components-svelte';
  import { ArrowRight } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import type { Snippet } from 'svelte';
  import { KEY } from '../commons/constants/dom.constants';

  interface ProjectCardProps {
    title: string;
    icon: Snippet;
    selected?: boolean;
    selectable?: boolean;
    name?: string;
    onclick?: (e: Event) => void | undefined;
    onkeydown?: (e: KeyboardEvent) => void | undefined;
    tabIndex?: number;
    'data-testid'?: string;
  }

  let {
    title,
    icon,
    selected = false,
    selectable = true,
    name = 'project-type',
    onclick,
    onkeydown,
    tabIndex = 0,
    'data-testid': dataTestId
  }: ProjectCardProps = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === KEY.ENTER || e.key === KEY.SPACE) {
      e.preventDefault();
      onclick?.(e);
    }
    onkeydown?.(e);
  }
</script>

<div
  class={clsx(
    'project-card w-full relative cursor-pointer pl-5 pt-5 pb-5',
    selected && 'selected'
  )}
  role="tab"
  tabindex={tabIndex}
  onclick={onclick}
  onkeydown={handleKeydown}
  aria-selected={selected}
  data-testid={dataTestId}
>
  <div class="flex justify-between w-full items-start pb-3">
    <div
      class={clsx(
        'flex items-center justify-center icon-primary opacity-80',
        selected && 'icon-interactive opacity-100'
      )}
    >
      {@render icon()}
    </div>

    <div class="flex justify-end">
      {#if selectable}
        <RadioButton name={name} checked={selected} />
      {/if}
    </div>
  </div>

  <div class="self-start mt-3 mb-5">
    <h6 class="text-left">{title}</h6>
  </div>

  {#if !selectable}
    <div class="nav-arrow">
      <ArrowRight size={16} />
    </div>
  {/if}
</div>

<style>
  .project-card {
    background: linear-gradient(
      0deg,
      rgba(230, 20, 45, 0.14) 0%,
      var(--cds-layer) 100%
    );
    box-sizing: border-box;
    height: 100%;
  }

  .project-card.selected {
    background: linear-gradient(
      0deg,
      rgba(230, 20, 45, 0.35) 0%,
      rgba(230, 20, 45, 0.05) 100%
    );
  }

  .nav-arrow {
    position: absolute;
    bottom: var(--cds-spacing-05);
    right: var(--cds-spacing-05);
    opacity: 0.6;
  }
</style>
