export {};

declare global {
  /** Shape every page module may expose to the SPA router. */
  interface RadiantBlazePageModule {
    initPage?: (options?: { fromSpa?: boolean }) => void | Promise<void>;
  }

  interface Window {
    RadiantBlazePageLoader?: {
      show(): void;
      hide(): void;
    };
  }

  /** Set while the router imports a page module so it skips auto-init. */
  var __radiantBlazeSpaImport: boolean | undefined;
}
