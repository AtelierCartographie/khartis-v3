declare module 'svelte/elements' {
  interface HTMLAttributes<T> {
    onoutsideclick?: (event: CustomEvent) => void;
  }
}

export {};
