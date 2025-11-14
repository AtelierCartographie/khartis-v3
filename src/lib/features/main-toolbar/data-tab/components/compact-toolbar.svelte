<script lang="ts">
  import { Button } from 'carbon-components-svelte';
  import {
    Search,
    Filter,
    Table,
    TrashCan,
    Restart,
    Maximize
  } from 'carbon-icons-svelte';

  interface CompactToolbarProps {
    onSearch?: () => void;
    onFilter?: () => void;
    onToggleView?: () => void;
    onDelete?: () => void;
    onRefresh?: () => void;
    onExpand?: () => void;
    searchActive?: boolean;
    filterActive?: boolean;
    hasSelection?: boolean;
  }

  let {
    onSearch,
    onFilter,
    onToggleView,
    onDelete,
    onRefresh,
    onExpand,
    searchActive = false,
    filterActive = false,
    hasSelection = false
  }: CompactToolbarProps = $props();
</script>

<div class="compact-toolbar">
  <div class="toolbar-group">
    <Button
      kind="ghost"
      size="small"
      icon={Search}
      iconDescription="Rechercher dans le tableau"
      tooltipPosition="bottom"
      hasIconOnly
      on:click={onSearch || (() => {})}
      class={searchActive ? 'active' : ''}
    />

    <Button
      kind="ghost"
      size="small"
      icon={Filter}
      iconDescription="Filtrer les données"
      tooltipPosition="bottom"
      hasIconOnly
      on:click={onFilter || (() => {})}
      class={filterActive ? 'active' : ''}
    />

    <Button
      kind="ghost"
      size="small"
      icon={Table}
      iconDescription="Afficher/masquer les colonnes"
      tooltipPosition="bottom"
      hasIconOnly
      on:click={onToggleView || (() => {})}
    />

    <div class="toolbar-divider"></div>

    <Button
      kind="ghost"
      size="small"
      icon={TrashCan}
      iconDescription="Supprimer la sélection"
      tooltipPosition="bottom"
      hasIconOnly
      disabled={!hasSelection}
      on:click={onDelete || (() => {})}
    />

    <Button
      kind="ghost"
      size="small"
      icon={Restart}
      iconDescription="Réinitialiser les modifications"
      tooltipPosition="bottom"
      hasIconOnly
      on:click={onRefresh || (() => {})}
    />
  </div>

  <div class="toolbar-group">
    <Button
      kind="ghost"
      size="small"
      icon={Maximize}
      iconDescription="Agrandir le tableau"
      tooltipPosition="bottom"
      hasIconOnly
      on:click={onExpand || (() => {})}
    />
  </div>
</div>

<style>
  .compact-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--cds-spacing-03) var(--cds-spacing-04);
    background-color: var(--cds-layer-01);
    border-bottom: 1px solid var(--cds-border-subtle);
    gap: var(--cds-spacing-03);
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .toolbar-divider {
    width: 1px;
    height: 1.5rem;
    background-color: var(--cds-border-subtle);
    margin: 0 var(--cds-spacing-02);
  }

  .compact-toolbar :global(.bx--btn--ghost) {
    min-height: 2rem;
    padding: var(--cds-spacing-02);
  }

  .compact-toolbar :global(.bx--btn--ghost.active) {
    background-color: var(--cds-layer-selected-01);
    color: var(--cds-interactive-01);
  }

  .compact-toolbar :global(.bx--btn--ghost.active svg) {
    fill: var(--cds-interactive-01);
  }

  .compact-toolbar :global(.bx--btn--ghost:hover:not(:disabled)) {
    background-color: var(--cds-layer-hover-01);
  }

  .compact-toolbar :global(.bx--btn--ghost:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Tooltip styling */
  .compact-toolbar :global(.bx--tooltip__trigger) {
    display: inline-flex;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .compact-toolbar {
      flex-wrap: wrap;
      gap: var(--cds-spacing-02);
    }

    .toolbar-group {
      flex: 1;
      min-width: max-content;
    }
  }
</style>
