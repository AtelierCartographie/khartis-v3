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
  LIMITS: {
    MAX_PROJECTS: 50,
    MAX_PROJECT_SIZE: 100 * 1024 * 1024,
    HISTORY_LIMIT: 50
  },
  TIMINGS: {
    AUTO_SAVE_DELAY: 750
  },
  APP_VERSION: '3.9.0'
} as const;
