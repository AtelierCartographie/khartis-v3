export const PROJECT_CONST = {
  DB: {
    NAME: 'KhartisDB',
    VERSION: 2,
    STORE_NAME: 'projects',
    METADATA_STORE_NAME: 'metadata'
  },
  LIMITS: {
    MAX_PROJECTS: 50,
    MAX_PROJECT_SIZE: 100 * 1024 * 1024,
    HISTORY_LIMIT: 50
  },
  TIMINGS: {
    AUTO_SAVE_DELAY: 5000
  },
  APP_VERSION: '3.1.0'
} as const;
