const LOCALHOST = 'localhost';
const LOOPBACK = '127.0.0.1';
const PREPROD_PATH = '/cartographie/khartisnewpprd';

export enum Environment {
  DEVELOPMENT = 'development',
  PREPRODUCTION = 'preproduction',
  PRODUCTION = 'production'
}

export const EnvironmentUtils = {
  getEnvironment(): Environment {
    if (typeof window === 'undefined') {
      return Environment.DEVELOPMENT;
    }

    const { hostname, pathname } = window.location;

    if (hostname === LOCALHOST || hostname === LOOPBACK) {
      return Environment.DEVELOPMENT;
    }

    if (pathname.startsWith(PREPROD_PATH)) {
      return Environment.PREPRODUCTION;
    }

    return Environment.PRODUCTION;
  },

  isProduction(): boolean {
    return EnvironmentUtils.getEnvironment() === Environment.PRODUCTION;
  },

  isPreproduction(): boolean {
    return EnvironmentUtils.getEnvironment() === Environment.PREPRODUCTION;
  },

  isDevelopment(): boolean {
    return EnvironmentUtils.getEnvironment() === Environment.DEVELOPMENT;
  }
} as const;
