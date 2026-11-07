/**
 * A release's page on GitHub, from the update configuration electron-builder writes into the app (`app-update.yml`, from
 * electron-builder.yml's `publish`), so the repository is named in one place. Releases are tagged `v{version}`.
 */
export namespace ReleasePage {

    export function of(appUpdateConfig: string, version: string): string | undefined {
        const value = (key: string) => new RegExp(`^${key}:\\s*['"]?([^'"\\s]+)`, 'm').exec(appUpdateConfig)?.[1];
        const owner = value('owner');
        const repo = value('repo');
        if (value('provider') !== 'github' || !owner || !repo) {
            return undefined;
        }
        return `https://github.com/${owner}/${repo}/releases/tag/v${version}`;
    }
}
