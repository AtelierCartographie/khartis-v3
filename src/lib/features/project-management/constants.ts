export const PROJECT_CONST = {
  DB: {
    NAME: 'KhartisDB',
    VERSION: 1,
    STORE_NAME: 'projects'
  },
  LIMITS: {
    MAX_PROJECTS: 50,
    MAX_PROJECT_SIZE: 100 * 1024 * 1024,
    HISTORY_LIMIT: 50
  },
  TIMINGS: {
    AUTO_SAVE_DELAY: 30000
  },
  APP_VERSION: '3.0.0'
} as const;
