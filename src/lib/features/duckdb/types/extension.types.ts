export interface ExtensionsLoaded {
  spatial: boolean;
  httpfs: boolean;
}

export interface ExtensionLoadPromises {
  spatial: Promise<void> | null;
  httpfs: Promise<void> | null;
}
