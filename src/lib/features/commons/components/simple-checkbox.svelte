<script lang="ts">
  interface Props {
    checked?: boolean;
    indeterminate?: boolean;
    disabled?: boolean;
    onchange?: () => void;
  }

  const {
    checked = false,
    indeterminate = false,
    disabled = false,
    onchange
  }: Props = $props();
</script>

<button
  type="button"
  class="simple-checkbox"
  class:checked
  class:indeterminate={indeterminate && !checked}
  class:disabled
  onclick={onchange}
  {disabled}
  aria-checked={indeterminate ? 'mixed' : checked}
  role="checkbox"
>
  {#if checked}
    <svg class="checkmark" viewBox="0 0 12 12" fill="none">
      <path d="M2 6L5 9L10 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  {:else if indeterminate}
    <svg class="indeterminate-mark" viewBox="0 0 12 12" fill="none">
      <path d="M2 6H10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  {/if}
</button>

<style>
  .simple-checkbox {
    width: 16px;
    height: 16px;
    min-width: 16px;
    min-height: 16px;
    border: 1px solid var(--cds-icon-01, #161616);
    border-radius: 2px;
    background-color: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background-color 0.1s, border-color 0.1s;
  }

  .simple-checkbox:hover:not(.disabled) {
    border-color: var(--cds-interactive-01, #0f62fe);
  }

  .simple-checkbox:focus {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: 1px;
  }

  .simple-checkbox.checked,
  .simple-checkbox.indeterminate {
    background-color: var(--cds-interactive-01, #0f62fe);
    border-color: var(--cds-interactive-01, #0f62fe);
  }

  .simple-checkbox.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .checkmark,
  .indeterminate-mark {
    width: 10px;
    height: 10px;
    color: white;
  }
</style>
