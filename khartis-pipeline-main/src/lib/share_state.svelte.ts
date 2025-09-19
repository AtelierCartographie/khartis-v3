import type { TableData } from '../types/index.js';

// See https://joyofcode.xyz/how-to-share-state-in-svelte-5#global-state

// reactive object using a Proxy
export const current_table = $state<{ value: TableData | null }>({ value: null });

export const file = $state<{ value: File | null }>({ value: null });
