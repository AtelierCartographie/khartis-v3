function createMapLoadingStore() {
  const state = $state({
    isUpdatingLayers: false,
    referenceBasemapLoadingCount: 0,
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

  function beginReferenceBasemapLoading(): void {
    state.referenceBasemapLoadingCount += 1;
  }

  function endReferenceBasemapLoading(): void {
    state.referenceBasemapLoadingCount = Math.max(
      0,
      state.referenceBasemapLoadingCount - 1
    );
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
    get isReferenceBasemapLoading(): boolean {
      return state.referenceBasemapLoadingCount > 0;
    },
    get isHoldingPreviewForSuggestedBasemap(): boolean {
      return state.isHoldingPreviewForSuggestedBasemap;
    },
    setUpdatingLayers,
    beginReferenceBasemapLoading,
    endReferenceBasemapLoading,
    setHoldingPreviewForSuggestedBasemap,
    armSuggestedPreviewRelease,
    markSuggestedPreviewViewportSettled
  };
}

export const mapLoadingStore = createMapLoadingStore();
