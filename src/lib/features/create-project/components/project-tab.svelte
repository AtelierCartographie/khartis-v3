<script lang="ts">
  import clsx from 'clsx';
  import type { Snippet } from 'svelte';
  import { KEY } from '../../commons/constants/dom.constants';

  interface ProjectTabProps {
    id?: string;
    title: string;
    icon: Snippet;
    selected?: boolean;
    ariaControls?: string;
    onclick?: (e: Event) => void | undefined;
    onkeydown?: (e: KeyboardEvent) => void | undefined;
    tabIndex?: number;
    'data-testid'?: string;
  }

  let {
    id,
    title,
    icon,
    selected = false,
    ariaControls,
    onclick,
    onkeydown,
    tabIndex = 0,
    'data-testid': dataTestId
  }: ProjectTabProps = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === KEY.ENTER || e.key === KEY.SPACE) {
      e.preventDefault();
      onclick?.(e);
    }
    onkeydown?.(e);
  }
</script>

<div
  id={id}
  class={clsx('project-card', selected && 'selected')}
  role="tab"
  tabindex={tabIndex}
  onclick={onclick}
  onkeydown={handleKeydown}
  aria-selected={selected}
  aria-controls={ariaControls}
  data-testid={dataTestId}
>
  <div class="project-card-top">
    <span class="project-card-icon">
      {@render icon()}
    </span>
    <span class="project-card-indicator" aria-hidden="true"></span>
  </div>

  <p class="tab-title">{title}</p>
</div>

<style>
  .project-card {
    --project-card-accent: 230, 20, 45;

    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--kh-gap-inline);
    width: 100%;
    height: 100%;
    max-height: 90px;
    padding: var(--kh-gap-param) var(--kh-pad-panel);
    background: linear-gradient(
      0deg,
      rgba(var(--project-card-accent), 0.07) 0%,
      var(--cds-layer) 100%
    );
    cursor: pointer;
  }

  .project-card:hover {
    background: linear-gradient(
      0deg,
      rgba(var(--project-card-accent), 0.2) 0%,
      var(--cds-layer) 100%
    );
  }

  .project-card.selected {
    background: linear-gradient(
      0deg,
      rgba(var(--project-card-accent), 0.5) 0%,
      rgba(var(--project-card-accent), 0.06) 100%
    );
  }

  .project-card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .project-card-icon {
    display: inline-flex;
    color: var(--cds-icon-secondary);
  }

  .project-card.selected .project-card-icon {
    color: var(--cds-icon-primary);
  }

  .project-card-indicator {
    align-items: center;
    background: var(--cds-field, #f4f4f4);
    border: 1px solid var(--cds-icon-primary, #161616);
    border-radius: 50%;
    box-sizing: border-box;
    display: inline-flex;
    flex-shrink: 0;
    height: 1rem;
    justify-content: center;
    width: 1rem;
  }

  .project-card-indicator::after {
    background: var(--cds-icon-primary, #161616);
    border-radius: 50%;
    content: '';
    height: 0.5rem;
    opacity: 0;
    width: 0.5rem;
  }

  .project-card.selected .project-card-indicator::after {
    opacity: 1;
  }

  .tab-title {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    margin: 0;
    min-width: 0;
    color: var(--cds-text-secondary);
    font-size: var(--cds-body-short-02-font-size, 1rem);
    font-weight: 600;
    line-height: 1.375rem;
    text-align: left;
  }

  .project-card.selected .tab-title {
    color: var(--cds-text-primary);
  }
</style>
