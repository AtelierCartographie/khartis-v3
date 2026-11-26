let pendingFocusItemId = $state<string | null>(null);
let pendingCenterItemId = $state<string | null>(null);
let selectedItemId = $state<string | null>(null);

export function requestLegendItemFocus(itemId: string): void {
  pendingFocusItemId = itemId;
}

export function getPendingLegendItemFocus(): string | null {
  return pendingFocusItemId;
}

export function clearLegendItemFocus(): void {
  pendingFocusItemId = null;
}

/** The legend tool asks the map to centre the page on one legend frame. */
export function requestLegendItemCentering(itemId: string): void {
  pendingCenterItemId = itemId;
}

export function getPendingLegendItemCentering(): string | null {
  return pendingCenterItemId;
}

export function clearLegendItemCentering(): void {
  pendingCenterItemId = null;
}

/** The legend frame selected on the map, which the page is centred on. */
export function setSelectedLegendItem(itemId: string | null): void {
  selectedItemId = itemId;
}

export function getSelectedLegendItem(): string | null {
  return selectedItemId;
}
