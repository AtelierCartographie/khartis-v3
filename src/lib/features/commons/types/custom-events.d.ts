declare module 'svelte/elements' {
  interface HTMLAttributes<_T> {
    onoutsideclick?: (event: CustomEvent) => void;
  }
}

export {};
