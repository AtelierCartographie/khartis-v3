<script lang="ts">
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/store/global.svelte';
  import { ButtonKind } from '$lib/features/commons/types/enums';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import { Button } from 'carbon-components-svelte';
  import { Add } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import AddDataModal from './add-data-modal.svelte';

  let tabsScroller: HTMLDivElement | null = null;

  const onWheel = (e: WheelEvent) => {
    if (!tabsScroller) return;
    const dx = Math.abs(e.deltaX);
    const dy = Math.abs(e.deltaY);
    if (dy >= dx) {
      tabsScroller.scrollLeft += e.deltaY;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const openAddDataModal = () => {
    globalState.isAddDataModalOpen = true;
  };

  const closeAddDataModal = () => {
    globalState.isAddDataModalOpen = false;
  };

  const addDataButton = () => {
    const newId = `data-${globalState.dataButtons.length + 1}`;
    const newLabel = `Data ${globalState.dataButtons.length + 1}`;

    globalState.dataButtons.forEach((button) => {
      button.isSelected = false;
    });

    globalState.dataButtons.push({
      id: newId,
      label: newLabel,
      isSelected: true
    });

    closeAddDataModal();
  };
</script>

<div
  class={clsx(
    'w-full flex items-center overflow-hidden',
    globalState.toolbarState === ToolbarState.Collapsed && 'opacity-0'
  )}
>
  <div
    class="tabs-scroller scrollbar-hidden"
    bind:this={tabsScroller}
    on:wheel={onWheel}
  >
    {#each globalState.dataButtons as dataButton (dataButton.id)}
      <Button
        isSelected={dataButton.isSelected}
        kind={dataButton.isSelected ? ButtonKind.Primary : ButtonKind.Ghost}
        on:click={() => globalActions.selectDataButton(dataButton.id)}
      >
        {dataButton.label}
      </Button>
    {/each}
  </div>

  <div class="add-btn-wrapper">
    <Button
      kind="ghost"
      iconDescription="Ajouter des données"
      icon={Add}
      on:click={openAddDataModal}
      aria-label="Ajouter des données"
    />
  </div>
</div>

<AddDataModal
  bind:open={globalState.isAddDataModalOpen}
  addDataButton={addDataButton}
/>

<style>
  .tabs-scroller {
    display: flex;
    gap: var(--cds-spacing-03);
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
    flex: 1 1 auto;
    min-width: 0;
    padding: var(--cds-spacing-02) 0;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }

  .add-btn-wrapper {
    flex: 0 0 auto;
    margin-left: var(--cds-spacing-03);
  }

  .scrollbar-hidden {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .scrollbar-hidden::-webkit-scrollbar {
    display: none;
  }
</style>
