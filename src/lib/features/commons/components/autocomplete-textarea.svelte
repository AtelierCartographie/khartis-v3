<script lang="ts">
  import { KEY } from '../constants/dom.constants';
  import { m } from '$lib/paraglide/messages';

  export interface Suggestion {
    label: string;
    value: string;
    type: 'variable' | 'function' | 'operator';
    description?: string;
  }

  interface Props {
    value: string;
    suggestions: Suggestion[];
    rows?: number;
    labelText?: string;
    placeholder?: string;
    onchange?: (value: string) => void;
  }

  let {
    value = $bindable(''),
    suggestions = [],
    rows = 4,
    labelText = '',
    placeholder = '',
    onchange
  }: Props = $props();

  let textareaRef = $state<HTMLTextAreaElement | null>(null);
  let showDropdown = $state(false);
  let filteredSuggestions = $state<Suggestion[]>([]);
  let selectedIndex = $state(0);
  let cursorPosition = $state(0);
  const componentId = $props.id();
  const textareaId = `autocomplete-textarea-${componentId}`;
  const suggestionsId = `autocomplete-suggestions-${componentId}`;
  const activeSuggestionId = $derived(
    showDropdown && filteredSuggestions.length > 0
      ? getSuggestionId(selectedIndex)
      : undefined
  );

  function getSuggestionId(index: number): string {
    return `${suggestionsId}-option-${index}`;
  }

  function getWordAtCursor(
    text: string,
    position: number
  ): { word: string; start: number } {
    const beforeCursor = text.slice(0, position);
    const match = beforeCursor.match(/[a-zA-Z0-9_éèêëàâäùûüîïôö]*$/);
    const word = match ? match[0] : '';
    return { word, start: position - word.length };
  }

  function updateSuggestions() {
    if (!textareaRef) return;

    const position = textareaRef.selectionStart;
    cursorPosition = position;
    const text = value;

    const beforeCursor = text.slice(0, position);
    const lastQuoteIndex = beforeCursor.lastIndexOf('"');
    const quoteCount = (beforeCursor.match(/"/g) || []).length;

    if (quoteCount % 2 === 1 && lastQuoteIndex !== -1) {
      const partial = beforeCursor.slice(lastQuoteIndex + 1).toLowerCase();
      filteredSuggestions = suggestions
        .filter((s) => s.type === 'variable')
        .filter((s) => s.label.toLowerCase().includes(partial))
        .slice(0, 8);
      showDropdown = filteredSuggestions.length > 0;
      selectedIndex = 0;
      return;
    }

    const { word } = getWordAtCursor(text, position);
    if (word.length >= 1) {
      const lowerWord = word.toLowerCase();
      filteredSuggestions = suggestions
        .filter((s) => s.type === 'function')
        .filter(
          (s) =>
            s.label.toLowerCase().includes(lowerWord) ||
            s.value.toLowerCase().includes(lowerWord)
        )
        .slice(0, 8);
      showDropdown = filteredSuggestions.length > 0;
      selectedIndex = 0;
      return;
    }

    showDropdown = false;
  }

  function insertSuggestion(suggestion: Suggestion) {
    if (!textareaRef) return;

    const text = value;
    const position = cursorPosition;

    let newValue: string;
    let newCursorPosition: number;

    if (suggestion.type === 'variable') {
      const beforeCursor = text.slice(0, position);
      const lastQuoteIndex = beforeCursor.lastIndexOf('"');
      const before = text.slice(0, lastQuoteIndex + 1);
      const after = text.slice(position);
      newValue = before + suggestion.value + '"' + after;
      newCursorPosition = before.length + suggestion.value.length + 1;
    } else if (suggestion.type === 'function') {
      const { start } = getWordAtCursor(text, position);
      const before = text.slice(0, start);
      const after = text.slice(position);
      newValue = before + suggestion.value + after;
      newCursorPosition = before.length + suggestion.value.length;
    } else {
      newValue = value + suggestion.value;
      newCursorPosition = newValue.length;
    }

    value = newValue;
    showDropdown = false;
    onchange?.(value);

    requestAnimationFrame(() => {
      if (textareaRef) {
        textareaRef.focus();
        textareaRef.setSelectionRange(newCursorPosition, newCursorPosition);
      }
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!showDropdown) return;

    switch (e.key) {
      case KEY.ARROW_DOWN:
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % filteredSuggestions.length;
        break;
      case KEY.ARROW_UP:
        e.preventDefault();
        selectedIndex =
          (selectedIndex - 1 + filteredSuggestions.length) %
          filteredSuggestions.length;
        break;
      case KEY.ENTER:
      case KEY.TAB:
        if (filteredSuggestions.length > 0) {
          e.preventDefault();
          insertSuggestion(filteredSuggestions[selectedIndex]);
        }
        break;
      case KEY.ESCAPE:
        e.preventDefault();
        showDropdown = false;
        break;
    }
  }

  function handleInput() {
    onchange?.(value);
    updateSuggestions();
  }

  function handleBlur() {
    setTimeout(() => {
      showDropdown = false;
    }, 200);
  }

  function handleFocus() {
    updateSuggestions();
  }
</script>

<div class="autocomplete-container">
  {#if labelText}
    <label class="field-label" for={textareaId}>{labelText}</label>
  {/if}

  <textarea
    id={textareaId}
    bind:this={textareaRef}
    bind:value={value}
    rows={rows}
    placeholder={placeholder}
    class="formula-textarea"
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={showDropdown && filteredSuggestions.length > 0}
    aria-controls={showDropdown ? suggestionsId : undefined}
    aria-activedescendant={activeSuggestionId}
    aria-label={!labelText && placeholder ? placeholder : undefined}
    onkeydown={handleKeydown}
    oninput={handleInput}
    onblur={handleBlur}
    onfocus={handleFocus}></textarea>

  {#if showDropdown && filteredSuggestions.length > 0}
    <div id={suggestionsId} class="suggestions-dropdown" role="listbox">
      {#each filteredSuggestions as suggestion, i (suggestion.value)}
        <button
          id={getSuggestionId(i)}
          type="button"
          class="suggestion-item"
          class:selected={i === selectedIndex}
          role="option"
          aria-selected={i === selectedIndex}
          onmousedown={() => insertSuggestion(suggestion)}
          onmouseenter={() => (selectedIndex = i)}
        >
          <span
            class="suggestion-type"
            class:variable={suggestion.type === 'variable'}
            class:function={suggestion.type === 'function'}
          >
            {suggestion.type === 'variable'
              ? m.autocomplete_type_variable()
              : m.autocomplete_type_function()}
          </span>
          <span class="suggestion-label">{suggestion.label}</span>
          {#if suggestion.description}
            <span class="suggestion-desc">{suggestion.description}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .autocomplete-container {
    position: relative;
    width: 100%;
  }

  .field-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-02);
  }

  .formula-textarea {
    width: 100%;
    min-height: 80px;
    padding: var(--cds-spacing-03);
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.875rem;
    line-height: 1.4;
    border: 1px solid var(--cds-border-strong);
    border-radius: 4px;
    background-color: var(--cds-field);
    color: var(--cds-text-01);
    resize: vertical;
  }

  .formula-textarea:focus {
    outline: 2px solid var(--cds-focus);
    outline-offset: -2px;
  }

  .suggestions-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    z-index: var(--z-notification);
    max-height: 200px;
    overflow-y: auto;
    background-color: var(--cds-ui-01);
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .suggestion-item {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    width: 100%;
    padding: var(--cds-spacing-03);
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--cds-text-01);
  }

  .suggestion-item:hover,
  .suggestion-item.selected {
    background-color: var(--cds-hover-ui);
  }

  .suggestion-type {
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    padding: 2px 4px;
    border-radius: 2px;
    background-color: var(--cds-ui-03);
    color: var(--cds-text-02);
  }

  .suggestion-type.variable {
    background-color: var(--cds-support-02);
    color: white;
  }

  .suggestion-type.function {
    background-color: var(--cds-support-04);
    color: white;
  }

  .suggestion-label {
    flex: 1;
    font-weight: 500;
  }

  .suggestion-desc {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }
</style>
