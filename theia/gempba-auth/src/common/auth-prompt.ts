/**
 * What an SSH connection asks the user, served by the frontend of the window that is connecting. Every answer
 * can be a cancel (undefined or false), which aborts that authentication step.
 */
export const AUTH_PROMPT_PATH = '/services/gempba-auth-prompt';

export const AuthPrompt = Symbol('AuthPrompt');

export interface AuthPrompt {
    /** One keyboard-interactive round (an MFA passcode): one answer per field, in order. */
    keyboardInteractive(name: string, instruction: string, fields: AuthPrompt.Field[]): Promise<string[] | undefined>;
    /** The passphrase of an encrypted private key. */
    passphrase(keyPath: string): Promise<string | undefined>;
    /** Trust a host key seen for the first time; a changed key is rejected without asking. */
    confirmHostKey(host: string, keyType: string, fingerprint: string): Promise<boolean>;
}

export namespace AuthPrompt {
    /** One line of a keyboard-interactive challenge; `echo` is false for secrets such as a passcode. */
    export interface Field {
        readonly label: string;
        readonly echo: boolean;
    }
}
