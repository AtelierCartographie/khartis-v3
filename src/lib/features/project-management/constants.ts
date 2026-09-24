export const PROJECT_CONST = {
  DB: {
    NAME: 'KhartisDB',
    VERSION: 3,
    STORE_NAME: 'projects',
    METADATA_STORE_NAME: 'metadata',
    ASSET_STORE_NAME: 'project_assets',
    ASSET_CHUNK_STORE_NAME: 'project_asset_chunks',
    ASSET_REF_STORE_NAME: 'project_asset_refs'
  },
  ASSETS: {
    CHUNK_SIZE: 8 * 1024 * 1024
  },
  ARCHIVE: {
    CURRENT_VERSION: 2,
    SUPPORTED_VERSIONS: [2]
  },
  SCHEMA_BASELINE_VERSION: '3.9.0',
  SCHEMA_VERSION: '3.10.0'
} as const;
