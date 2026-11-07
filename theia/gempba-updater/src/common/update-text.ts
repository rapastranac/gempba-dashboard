/** What the updater says, in one place. */
export namespace UpdateText {

    export const UPDATE = 'Update';
    export const RELEASE_NOTES = 'Release Notes';
    export const OPEN_RELEASE_PAGE = 'Open Release Page';
    export const RESTART = 'Restart Now';
    export const LATER = 'Later';

    export const CHECKING = 'Checking for updates…';
    export const INACTIVE = 'Updates are checked in the installed app only.';

    export function available(app: string, version: string): string {
        return `${app} ${version} is available.`;
    }

    export function availableFromPage(app: string, version: string): string {
        return `${app} ${version} is available. Download it from the release page.`;
    }

    export function downloading(app: string, version: string): string {
        return `Downloading ${app} ${version}`;
    }

    export function progress(percent: number): string {
        return `${Math.floor(Math.min(Math.max(percent, 0), 100))} %`;
    }

    export function ready(app: string, version: string): string {
        return `${app} ${version} is ready to install.`;
    }

    export function upToDate(app: string, version: string): string {
        return `${app} ${version} is up to date.`;
    }

    export function checkFailed(reason: string): string {
        return `Couldn't check for updates: ${reason}.`;
    }

    export function downloadFailed(reason: string): string {
        return `Couldn't download the update: ${reason}.`;
    }

    const NO_MANIFEST = ['ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'];
    const NO_RELEASE = ['ERR_UPDATER_NO_PUBLISHED_VERSIONS', 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND', 'ERR_UPDATER_RELEASE_NOT_FOUND'];
    /** Chromium's network errors, then Node's. */
    const OFFLINE = [
        /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|ADDRESS_UNREACHABLE|NETWORK_CHANGED|NETWORK_ACCESS_DENIED)/,
        /\b(ENOTFOUND|EAI_AGAIN|ENETUNREACH)\b/
    ];
    const UNREACHABLE = [
        /net::ERR_(CONNECTION_[A-Z_]+|TIMED_OUT|PROXY_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED)/,
        /\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT)\b/
    ];
    const LONGEST_REASON = 120;

    /**
     * A failure in a few words: from electron-updater's error code, or Chromium's network error, else the message's
     * first line, since electron-updater's messages run on with the request's headers.
     */
    export function reason(error: unknown): string {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
        const message = error instanceof Error ? error.message : String(error);
        if (NO_MANIFEST.includes(code)) {
            return 'the latest release has no update information';
        }
        if (NO_RELEASE.includes(code)) {
            return 'no release was found';
        }
        if (OFFLINE.some(pattern => pattern.test(message))) {
            return 'no network connection';
        }
        if (UNREACHABLE.some(pattern => pattern.test(message))) {
            return "the update server can't be reached";
        }
        const line = message.split('\n', 1)[0].trim().replace(/\.$/, '');
        if (!line) {
            return 'unknown error';
        }
        return line.length > LONGEST_REASON ? `${line.slice(0, LONGEST_REASON - 1)}…` : line;
    }
}
