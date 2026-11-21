export declare const repoRoot: string;
export declare const cacheDir: string;
export declare const VENDORED: Record<string, [directory: string, dependency: string][]>;
export declare function resolvePackageFrom(fromRoot: string, name: string): string | null;
export declare function packageRootOf(id: string): string | null;
export declare function writePackageList(bundle: string, moduleIds: Iterable<string>): string;
export declare function readPackageList(bundle: string): string[] | null;
