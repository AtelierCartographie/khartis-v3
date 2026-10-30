let pendingFocusItemId = $state<string | null>(null);

export function requestLegendItemFocus(itemId: string): void {
  pendingFocusItemId = itemId;
}

export function getPendingLegendItemFocus(): string | null {
  return pendingFocusItemId;
}

export function clearLegendItemFocus(): void {
  pendingFocusItemId = null;
}
