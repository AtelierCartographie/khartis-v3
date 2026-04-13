export function resolveHoverHighlightProps(_pickable = true): {
  autoHighlight: boolean;
  highlightedObjectIndex: number;
} {
  return {
    autoHighlight: false,
    highlightedObjectIndex: -1
  };
}
