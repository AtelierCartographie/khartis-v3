import 'svelte';

declare module 'svelte' {
  namespace svelteHTML {
    interface HTMLAttributes<_T> {
      class?: string;
      id?: string;
      onclick?: (event: MouseEvent) => void;
      onkeydown?: (event: KeyboardEvent) => void;
      oninput?: (event: Event) => void;
      ontoggle?: (event: CustomEvent) => void;
      'aria-label'?: string;
      'aria-pressed'?: boolean | 'true' | 'false';
      'aria-expanded'?: boolean | 'true' | 'false';
      'on:click'?: (event: MouseEvent) => void;
      title?: string;
      inputmode?:
        | 'none'
        | 'text'
        | 'tel'
        | 'url'
        | 'email'
        | 'numeric'
        | 'decimal'
        | 'search';
    }
  }
}

declare global {
  namespace svelteHTML {
    interface HTMLAttributes<_T> {
      class?: string;
      id?: string;
      onclick?: (event: MouseEvent) => void;
      onkeydown?: (event: KeyboardEvent) => void;
      oninput?: (event: Event) => void;
      ontoggle?: (event: CustomEvent) => void;
      'aria-label'?: string;
      'aria-pressed'?: boolean | 'true' | 'false';
      'aria-expanded'?: boolean | 'true' | 'false';
      'on:click'?: (event: MouseEvent) => void;
      title?: string;
      inputmode?:
        | 'none'
        | 'text'
        | 'tel'
        | 'url'
        | 'email'
        | 'numeric'
        | 'decimal'
        | 'search';
    }
  }
}

