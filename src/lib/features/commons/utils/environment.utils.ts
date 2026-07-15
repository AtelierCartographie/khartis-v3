const LOCALHOST = 'localhost';
const LOOPBACK = '127.0.0.1';

export enum Environment {
  DEVELOPMENT = 'development',
  PREPRODUCTION = 'preproduction',
  PRODUCTION = 'production'
}

function environmentFromBuildVariable(): Environment | null {
  const value = import.meta.env.VITE_KHARTIS_ENV;
  if (value === Environment.PRODUCTION || value === Environment.PREPRODUCTION) {
    return value;
  }
  return null;
}

export const EnvironmentUtils = {
  getEnvironment(): Environment {
    const buildEnvironment = environmentFromBuildVariable();
    if (buildEnvironment) {
      return buildEnvironment;
    }

    if (typeof window === 'undefined') {
      return Environment.DEVELOPMENT;
    }

    const { hostname } = window.location;
    if (hostname === LOCALHOST || hostname === LOOPBACK) {
      return Environment.DEVELOPMENT;
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
