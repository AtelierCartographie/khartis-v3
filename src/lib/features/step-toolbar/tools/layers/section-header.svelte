<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Button } from 'carbon-components-svelte';
  import {
    ChevronDown,
    ChevronRight,
    Draggable,
    OverflowMenuVertical,
    ViewFilled
  } from 'carbon-icons-svelte';

  interface Props {
    title: string;
    count?: number;
    sectionIndex?: number;
    isDraggable?: boolean;
    isSectionDragging?: boolean;
    isSectionDragOver?: boolean;
    onSectionDragStart?: (index: number) => void;
    onSectionDragOver?: (index: number) => void;
    onSectionDragEnd?: () => void;
    onSectionDragLeave?: () => void;
    expanded?: boolean;
    onToggleExpand?: () => void;
  }

  const {
    title,
    count,
    sectionIndex = 0,
    isDraggable = false,
    isSectionDragging = false,
    isSectionDragOver = false,
    onSectionDragStart,
    onSectionDragOver,
    onSectionDragEnd,
    onSectionDragLeave,
    expanded = true,
    onToggleExpand
  }: Props = $props();

  function handleDragStart(event: DragEvent): void {
    if (!event.dataTransfer) return;

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', 'section');
    onSectionDragStart?.(sectionIndex);
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!event.dataTransfer) return;

    event.dataTransfer.dropEffect = 'move';
    onSectionDragOver?.(sectionIndex);
  }

  function handleDragEnter(event: DragEvent): void {
    event.preventDefault();
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    onSectionDragEnd?.();
  }

  function toggleExpand(): void {
    onToggleExpand?.();
  }
</script>

<div id="khartis-section-header-tool">
  <div class="section-container">
    <div
      class="section-header"
      class:collapsed={!expanded}
      class:section-dragging={isSectionDragging}
      class:section-drag-over={isSectionDragOver}
      role="button"
      tabindex="0"
      draggable={isDraggable}
      ondragstart={isDraggable ? handleDragStart : undefined}
      ondragover={isDraggable ? handleDragOver : undefined}
      ondragenter={isDraggable ? handleDragEnter : undefined}
      ondrop={isDraggable ? handleDrop : undefined}
      ondragleave={isDraggable ? onSectionDragLeave : undefined}
      ondragend={isDraggable ? onSectionDragEnd : undefined}
    >
      <Button
        kind="ghost"
        size="small"
        icon={expanded ? ChevronDown : ChevronRight}
        iconDescription={m.section_toggle()}
        class="section-expander"
        on:click={toggleExpand}
      />
      <Button
        kind="ghost"
        size="small"
        icon={Draggable}
        iconDescription={m.layers_reorder()}
        class={isDraggable ? 'section-drag-handle' : ''}
      />

      <span class="section-title">
        {title}{count !== undefined ? ` (${count})` : ''}
      </span>

      <div class="section-actions">
        <Button
          kind="ghost"
          size="small"
          icon={ViewFilled}
          iconDescription={m.layers_visibility()}
        />
        <Button
          kind="ghost"
          size="small"
          icon={OverflowMenuVertical}
          iconDescription={m.layers_more_options()}
        />
      </div>
    </div>
  </div>
</div>

<style>
  .section-container {
    background-color: var(--cds-ui-01);
    border: 1px solid var(--cds-border-subtle);
    margin-bottom: var(--cds-spacing-03);
  }

  .section-header {
    display: flex;
    align-items: center;
    padding: var(--cds-spacing-03);
    gap: var(--cds-spacing-03);
    transition: all 0.2s ease;
    background-color: var(--cds-ui-01);
  }

  .section-header.collapsed {
    background-color: var(--cds-ui-02);
  }

  #khartis-section-header-tool :global(.section-expander) {
    margin-right: var(--cds-spacing-02);
  }

  .section-header[draggable='true'] {
    cursor: grab;
  }

  .section-header[draggable='true']:hover {
    background-color: var(--cds-hover-ui);
  }

  .section-header.section-dragging {
    opacity: 0.5;
    cursor: grabbing;
    transform: rotate(1deg);
  }

  .section-header.section-drag-over {
    border-top: 3px solid var(--cds-interactive-01);
    background-color: var(--cds-hover-selected-ui);
  }

  #khartis-section-header-tool :global(.section-drag-handle) {
    cursor: grab;
  }

  .section-title {
    flex: 1;
    font-weight: 500;
    font-size: 0.875rem;
  }

  .section-actions {
    display: flex;
    gap: var(--cds-spacing-02);
  }
</style>
