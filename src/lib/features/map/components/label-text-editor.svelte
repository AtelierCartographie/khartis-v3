<script lang="ts">
  import { untrack } from 'svelte';
  import { Button, TextArea } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import { clickOutside } from '$lib/features/commons/utils/click-outside';
  import { KEY } from '$lib/features/commons/constants/dom.constants';
  import { portal } from '$lib/features/commons/utils/portal';
  import type { LabelEditRequest } from '../interactions/label-drag.controller';
  import { labelLayoutStore } from '../stores/label-layout.store.svelte';

  interface Props {
    request: LabelEditRequest;
    onclose: () => void;
  }

  let { request, onclose }: Props = $props();

  const EDITOR_WIDTH_PX = 288;
  const EDITOR_OFFSET_PX = 12;
  const VIEWPORT_MARGIN_PX = 8;

  // The parent remounts the editor for each request: the label's texts are
  // read once, when it opens.
  const texts = untrack(() => request.context.resolveTexts(request.datum));
  const isMoved = untrack(() =>
    request.context.hasManualPosition(request.datum)
  );
  let primary = $state(texts.primary);
  let secondary = $state(texts.secondary ?? '');
  let editor = $state<HTMLDivElement | null>(null);

  const left = $derived(
    Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(
        request.clientX + EDITOR_OFFSET_PX,
        window.innerWidth - EDITOR_WIDTH_PX - VIEWPORT_MARGIN_PX
      )
    )
  );
  const top = $derived(
    Math.max(VIEWPORT_MARGIN_PX, request.clientY + EDITOR_OFFSET_PX)
  );
  const isDataText = $derived(
    primary.trim() === texts.dataPrimary &&
      (texts.dataSecondary === null || secondary.trim() === texts.dataSecondary)
  );

  $effect(() => {
    const field = editor?.querySelector('textarea');
    field?.focus();
    field?.select();
  });

  function readValue(event: Event): string {
    return event.target instanceof HTMLTextAreaElement
      ? event.target.value
      : '';
  }

  // Only what differs from the data is stored, so a later fix in the data
  // still shows wherever the user typed nothing.
  function commit(): void {
    const nextPrimary = primary.trim();
    const nextSecondary = secondary.trim();
    labelLayoutStore.setText(request.context.vizId, request.featureKey, {
      primary: nextPrimary === texts.dataPrimary ? undefined : nextPrimary,
      secondary:
        texts.dataSecondary === null || nextSecondary === texts.dataSecondary
          ? undefined
          : nextSecondary
    });
    onclose();
  }

  function restoreDataText(): void {
    primary = texts.dataPrimary;
    secondary = texts.dataSecondary ?? '';
  }

  function putLabelBack(): void {
    labelLayoutStore.clearOffset(request.context.vizId, request.featureKey);
    onclose();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === KEY.ESCAPE) {
      event.preventDefault();
      event.stopPropagation();
      onclose();
      return;
    }
    if (event.key === KEY.ENTER && !event.shiftKey) {
      event.preventDefault();
      commit();
    }
  }
</script>

<div
  bind:this={editor}
  use:portal
  use:clickOutside
  onoutsideclick={commit}
  class="label-text-editor"
  role="dialog"
  tabindex="-1"
  aria-label={m.label_edit_title()}
  style:left="{left}px"
  style:top="{top}px"
  style:width="{EDITOR_WIDTH_PX}px"
  onkeydown={handleKeydown}
>
  <TextArea
    labelText={m.label_edit_primary()}
    value={primary}
    rows={2}
    on:input={(event) => {
      primary = readValue(event);
    }}
  />
  {#if texts.secondary !== null}
    <TextArea
      labelText={m.label_edit_secondary()}
      value={secondary}
      rows={1}
      on:input={(event) => {
        secondary = readValue(event);
      }}
    />
  {/if}
  <p class="kh-help">{m.label_edit_help()}</p>
  <div class="label-text-editor-actions">
    <Button
      kind="ghost"
      size="small"
      disabled={isDataText}
      on:click={restoreDataText}
    >
      {m.label_edit_restore()}
    </Button>
    {#if isMoved}
      <Button kind="ghost" size="small" on:click={putLabelBack}>
        {m.label_edit_put_back()}
      </Button>
    {/if}
  </div>
  <div class="label-text-editor-actions">
    <Button kind="secondary" size="small" on:click={onclose}>
      {m.label_edit_cancel()}
    </Button>
    <Button kind="primary" size="small" on:click={commit}>
      {m.label_edit_validate()}
    </Button>
  </div>
</div>

<style>
  .label-text-editor {
    position: fixed;
    z-index: 9000;
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-param);
    padding: var(--cds-spacing-04);
    background: var(--cds-ui-01, #f4f4f4);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }

  .label-text-editor-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--cds-spacing-02);
  }
</style>
