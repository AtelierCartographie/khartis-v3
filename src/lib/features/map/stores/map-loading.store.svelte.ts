function createMapLoadingStore() {
  const state = $state({
    isUpdatingLayers: false,
    isHoldingPreviewForSuggestedBasemap: false,
    shouldReleaseSuggestedPreviewAfterProcessing: false,
    isSuggestedPreviewViewportSettled: false,
    suggestedPreviewReleaseRequestId: 0
  });

  function cancelSuggestedPreviewRelease(): void {
    state.suggestedPreviewReleaseRequestId += 1;
  }

  function finalizeSuggestedPreviewRelease(requestId: number): void {
    if (requestId !== state.suggestedPreviewReleaseRequestId) {
      return;
    }

    if (
      !state.isHoldingPreviewForSuggestedBasemap ||
      !state.shouldReleaseSuggestedPreviewAfterProcessing ||
      !state.isSuggestedPreviewViewportSettled ||
      state.isUpdatingLayers
    ) {
      return;
    }

    state.shouldReleaseSuggestedPreviewAfterProcessing = false;
    state.isSuggestedPreviewViewportSettled = false;
    state.isHoldingPreviewForSuggestedBasemap = false;
  }

  function scheduleSuggestedPreviewRelease(
    requestId: number,
    framesRemaining = 4
  ): void {
    if (typeof requestAnimationFrame !== 'function') {
      finalizeSuggestedPreviewRelease(requestId);
      return;
    }

    requestAnimationFrame(() => {
      if (requestId !== state.suggestedPreviewReleaseRequestId) {
        return;
      }

      if (framesRemaining > 1) {
        scheduleSuggestedPreviewRelease(requestId, framesRemaining - 1);
        return;
      }

      finalizeSuggestedPreviewRelease(requestId);
    });
  }

  function tryReleaseSuggestedPreviewHold(): void {
    if (
      !state.isHoldingPreviewForSuggestedBasemap ||
      !state.shouldReleaseSuggestedPreviewAfterProcessing ||
      !state.isSuggestedPreviewViewportSettled ||
      state.isUpdatingLayers
    ) {
      return;
    }

    scheduleSuggestedPreviewRelease(state.suggestedPreviewReleaseRequestId);
  }

  function setUpdatingLayers(value: boolean): void {
    cancelSuggestedPreviewRelease();
    state.isUpdatingLayers = value;
    tryReleaseSuggestedPreviewHold();
  }

  function setHoldingPreviewForSuggestedBasemap(value: boolean): void {
    cancelSuggestedPreviewRelease();
    state.isHoldingPreviewForSuggestedBasemap = value;

    if (!value) {
      state.shouldReleaseSuggestedPreviewAfterProcessing = false;
      state.isSuggestedPreviewViewportSettled = false;
    }
  }

  function armSuggestedPreviewRelease(): void {
    if (!state.isHoldingPreviewForSuggestedBasemap) {
      return;
    }

    cancelSuggestedPreviewRelease();
    state.shouldReleaseSuggestedPreviewAfterProcessing = true;
    state.isSuggestedPreviewViewportSettled = false;
    tryReleaseSuggestedPreviewHold();
  }

  function markSuggestedPreviewViewportSettled(): void {
    if (!state.isHoldingPreviewForSuggestedBasemap) {
      return;
    }

    cancelSuggestedPreviewRelease();
    state.isSuggestedPreviewViewportSettled = true;
    tryReleaseSuggestedPreviewHold();
  }

  return {
    get isUpdatingLayers(): boolean {
      return state.isUpdatingLayers;
    },
    get isHoldingPreviewForSuggestedBasemap(): boolean {
      return state.isHoldingPreviewForSuggestedBasemap;
    },
    setUpdatingLayers,
    setHoldingPreviewForSuggestedBasemap,
    armSuggestedPreviewRelease,
    markSuggestedPreviewViewportSettled
  };
}

export const mapLoadingStore = createMapLoadingStore();
