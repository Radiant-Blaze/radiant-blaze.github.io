/**
 * Minimal declarations for the Node.js built-ins used while prerendering.
 *
 * The project intentionally does not depend on `@types/node`; `astro check`
 * still typechecks the prerender code in `src/`, so the handful of APIs those
 * modules use are declared here instead of pulling in the full toolchain types.
 */

declare module "node:fs/promises" {
  export function readFile(
    filePath: string,
    encoding: "utf8" | "utf-8",
  ): Promise<string>;
  export function readFile(filePath: string): Promise<Uint8Array>;

  export interface Dirent {
    readonly name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }

  export function readdir(
    directory: string,
    options: { withFileTypes: true },
  ): Promise<Dirent[]>;
  export function readdir(directory: string): Promise<string[]>;
}

declare module "node:path" {
  interface PathModule {
    readonly sep: string;
    join(...segments: string[]): string;
    resolve(...segments: string[]): string;
    basename(filePath: string, suffix?: string): string;
    dirname(filePath: string): string;
  }

  const path: PathModule;
  export default path;
}

declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
};
