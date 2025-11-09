export enum Environment {
  DEVELOPMENT = 'development',
  PREPRODUCTION = 'preproduction',
  PRODUCTION = 'production'
}

export class EnvironmentUtils {
  static getEnvironment(): Environment {
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
  }

  static isProduction(): boolean {
    return this.getEnvironment() === Environment.PRODUCTION;
  }

  static isPreproduction(): boolean {
    return this.getEnvironment() === Environment.PREPRODUCTION;
  }

  static isDevelopment(): boolean {
    return this.getEnvironment() === Environment.DEVELOPMENT;
  }
}
