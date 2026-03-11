<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import InfoPopover from './info-popover.svelte';

  interface Props {
    label: string;
    toggled: boolean;
    showYesNo?: boolean;
    infoText?: string;
    ontoggle?: (value: boolean) => void;
  }

  let {
    label,
    toggled = $bindable(),
    showYesNo = true,
    infoText,
    ontoggle
  }: Props = $props();

  function stopBubbleEvents(node: HTMLElement) {
    const events = [
      'click',
      'mousedown',
      'mouseup',
      'pointerdown',
      'pointerup',
      'keydown',
      'keyup'
    ] as const;
    const handler = (event: Event) => event.stopPropagation();

    events.forEach((eventName) => {
      node.addEventListener(eventName, handler, { capture: true });
    });

    return {
      destroy() {
        events.forEach((eventName) => {
          node.removeEventListener(eventName, handler, { capture: true });
        });
      }
    };
  }

  function handleToggleChange(next: boolean) {
    if (next === toggled) {
      return;
    }
    toggled = next;
    ontoggle?.(next);
  }
</script>

<div class="toggle-row">
  <span class="field-label">
    {label}
    {#if infoText}
      <InfoPopover text={infoText} />
    {/if}
  </span>
  <div class="toggle-with-label" use:stopBubbleEvents>
    <Switch
      toggled={toggled}
      hideLabel
      labelText={label}
      onchange={handleToggleChange}
    />
    {#if showYesNo}
      <span class="toggle-label">{toggled ? m.yes() : m.no()}</span>
    {/if}
  </div>
</div>

<style lang="scss">
  .toggle-row {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-02) 0;
    gap: var(--cds-spacing-04);
  }

  .field-label {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    font-weight: 400;
  }

  .toggle-with-label {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .toggle-label {
    font-size: 0.875rem;
    color: var(--cds-text-primary);
    min-width: 30px;
  }
</style>
