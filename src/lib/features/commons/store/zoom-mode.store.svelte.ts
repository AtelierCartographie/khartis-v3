export type ZoomMode = 'map' | 'page';

class ZoomModeStore {
  private _mode = $state<ZoomMode>('map');

  get mode(): ZoomMode {
    return this._mode;
  }

  get isMapMode(): boolean {
    return this._mode === 'map';
  }

  get isPageMode(): boolean {
    return this._mode === 'page';
  }

  setMapMode(): void {
    this._mode = 'map';
  }

  setPageMode(): void {
    this._mode = 'page';
  }

  toggle(): void {
    this._mode = this._mode === 'map' ? 'page' : 'map';
  }

  setMode(mode: ZoomMode): void {
    this._mode = mode;
  }
}

export const zoomModeStore = new ZoomModeStore();
