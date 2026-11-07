import { UpdateMode } from './update-mode';

/** The app's updater lives in Electron main, one for the whole app; each window reaches it over Theia's Electron IPC. */
export const UPDATER_PATH = '/services/gempba-updater';

export const Updater = Symbol('Updater');

export interface Updater {
    /** The check at startup: run for the first window that asks, and undefined for every later one. */
    checkAtStartup(): Promise<UpdateCheck | undefined>;
    check(): Promise<UpdateCheck>;
    /** Downloads the update the last check found, reporting its progress to the asking window. */
    download(): Promise<DownloadResult>;
    /** Quits, installs the downloaded update over this version, and starts the new one. */
    install(): Promise<void>;
}

/** Served by each window, for the updater to call back. */
export interface UpdaterClient {
    onDownloadProgress(percent: number): void;
}

export type UpdateCheck =
    | { readonly kind: 'available', readonly version: string, readonly mode: UpdateMode, readonly releasePage?: string }
    | { readonly kind: 'up-to-date', readonly version: string }
    | { readonly kind: 'failed', readonly reason: string }
    /** A development build, or a Linux build run neither as an AppImage nor from a package. */
    | { readonly kind: 'inactive' };

export type DownloadResult = { readonly ok: true } | { readonly ok: false, readonly reason: string };
