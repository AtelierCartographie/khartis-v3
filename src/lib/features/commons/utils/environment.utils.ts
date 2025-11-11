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

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return Environment.DEVELOPMENT;
    }

    if (pathname.startsWith('/cartographie/khartisnewpprd')) {
      return Environment.PRODUCTION;
    }

    return Environment.PREPRODUCTION;
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
