type CloseHandler = () => void;

const registry = new Map<string, CloseHandler>();
let activeSurfaceId: string | null = null;
let nextSurfaceSequence = 0;

export function createExclusiveContextualSurfaceId(
  prefix = 'contextual-surface'
): string {
  nextSurfaceSequence += 1;
  return `${prefix}-${nextSurfaceSequence}`;
}

export function engageExclusiveContextualSurface(
  id: string,
  onRequestClose: CloseHandler
): () => void {
  registry.set(id, onRequestClose);
  activeSurfaceId = id;

  for (const [registeredId, close] of registry) {
    if (registeredId !== id) {
      close();
    }
  }

  return () => {
    registry.delete(id);
    if (activeSurfaceId === id) {
      activeSurfaceId = null;
    }
  };
}

export function getActiveExclusiveContextualSurfaceId(): string | null {
  return activeSurfaceId;
}

export function resetExclusiveContextualSurfaces(): void {
  registry.clear();
  activeSurfaceId = null;
  nextSurfaceSequence = 0;
}
