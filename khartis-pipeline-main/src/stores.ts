import { writable, type Writable } from 'svelte/store';
import type { TableData } from './types/index.js';

export const file: Writable<File | undefined> = writable();
export const current_table: Writable<TableData | undefined> = writable();
