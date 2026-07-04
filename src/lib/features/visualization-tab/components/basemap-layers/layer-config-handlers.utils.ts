export type LayerConfigChangeHandler = (
  updates: Record<string, unknown>
) => void;

type LayerConfigChangeHandlerGetter = () =>
  LayerConfigChangeHandler | undefined;

type SelectedIdEvent = CustomEvent<{ selectedId: string }>;

export function createLayerConfigValueHandler<T>(
  getOnChange: LayerConfigChangeHandlerGetter,
  key: string
): (value: T) => void {
  return (value: T) => {
    getOnChange()?.({ [key]: value });
  };
}

export function createLayerConfigSelectedIdHandler<T>(
  getOnChange: LayerConfigChangeHandlerGetter,
  key: string,
  mapSelectedId: (selectedId: string) => T
): (event: SelectedIdEvent) => void {
  return (event: SelectedIdEvent) => {
    getOnChange()?.({ [key]: mapSelectedId(event.detail.selectedId) });
  };
}
