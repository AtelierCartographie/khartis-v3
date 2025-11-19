/// <reference types="vite/client" />

/**
 * Type definitions for Vite Worker imports
 * This allows TypeScript to understand the ?worker import syntax
 */

declare module '*?worker' {
  class WebWorker extends Worker {
    constructor();
  }
  export default WebWorker;
}

declare module '*?worker&inline' {
  class WebWorker extends Worker {
    constructor();
  }
  export default WebWorker;
}

declare module '*?sharedworker' {
  class WebWorker extends SharedWorker {
    constructor();
  }
  export default WebWorker;
}

declare module '*?raw' {
  const content: string;
  export default content;
}

declare module '*?url' {
  const url: string;
  export default url;
}