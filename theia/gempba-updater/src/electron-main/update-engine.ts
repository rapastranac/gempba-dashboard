import { UpdateMode } from '../common/update-mode';

/** What checks, downloads and installs: electron-updater in the app, a stand-in in the specs. */
export interface UpdateEngine {
    isActive(): boolean;
    currentVersion(): string;
    /** The newest release, and whether it is newer than this version; undefined when the check was skipped. */
    check(): Promise<{ readonly available: boolean, readonly version: string } | undefined>;
    download(onProgress: (percent: number) => void): Promise<void>;
    install(): void;
    mode(): Promise<UpdateMode>;
    releasePage(version: string): string | undefined;
}
