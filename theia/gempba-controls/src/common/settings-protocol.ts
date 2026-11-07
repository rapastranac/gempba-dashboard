import { DashboardSettings } from '@gempba/core';

/** The remembered UI state, read and written by the backend, which owns the file. */
export const SETTINGS_SERVICE_PATH = '/services/gempba-settings';

export const SettingsServer = Symbol('SettingsServer');

export interface SettingsServer {
    load(): Promise<DashboardSettings>;
    save(settings: DashboardSettings): Promise<void>;
}
