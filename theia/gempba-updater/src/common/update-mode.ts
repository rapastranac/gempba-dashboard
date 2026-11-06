/** Whether the app installs an update itself, or only says that one is out and links to its release page. */
export type UpdateMode = 'install' | 'notice';

export namespace UpdateMode {

    /**
     * Windows (NSIS) and the AppImage install in place. A deb or rpm belongs to its package manager. macOS installs in
     * place only into an app signed with a Developer ID, so an unsigned or ad-hoc signed build gets the notice.
     */
    export function of(platform: string, appImage: string | undefined, macDeveloperId: boolean): UpdateMode {
        switch (platform) {
            case 'win32':
                return 'install';
            case 'darwin':
                return macDeveloperId ? 'install' : 'notice';
            case 'linux':
                return appImage ? 'install' : 'notice';
            default:
                return 'notice';
        }
    }

    /** Whether `codesign -dv` names a team, as a Developer ID signature does; an ad-hoc signature has `not set`. */
    export function hasDeveloperId(codesignOutput: string): boolean {
        const team = /^TeamIdentifier=(.*)$/m.exec(codesignOutput)?.[1].trim();
        return !!team && team !== 'not set';
    }
}
