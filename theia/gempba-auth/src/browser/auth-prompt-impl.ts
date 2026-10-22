import { ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import { QuickInputService } from '@theia/core/lib/common/quick-pick-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AuthPrompt } from '../common/auth-prompt';

/** Answers the backend's SSH questions with stock Theia input boxes and a confirm dialog. */
@injectable()
export class AuthPromptImpl implements AuthPrompt {

    @inject(QuickInputService) protected readonly quickInput: QuickInputService;

    async keyboardInteractive(name: string, instruction: string, fields: AuthPrompt.Field[]): Promise<string[] | undefined> {
        const answers: string[] = [];
        for (const field of fields) {
            const answer = await this.quickInput.input({
                title: name.trim() || 'SSH authentication',
                prompt: [instruction.trim(), field.label.trim()].filter(text => text !== '').join(' '),
                password: !field.echo,
                ignoreFocusLost: true
            });
            if (answer === undefined) {
                return undefined;
            }
            answers.push(answer);
        }
        return answers;
    }

    passphrase(keyPath: string): Promise<string | undefined> {
        return this.quickInput.input({ title: 'SSH key passphrase', prompt: `Passphrase for ${keyPath}`, password: true, ignoreFocusLost: true });
    }

    async confirmHostKey(host: string, keyType: string, fingerprint: string): Promise<boolean> {
        const msg = document.createElement('div');
        for (const text of [`The authenticity of ${host} can't be established.`, `${keyType} key fingerprint is ${fingerprint}.`,
            'Trust this host and remember its key in ~/.ssh/known_hosts?']) {
            msg.appendChild(document.createElement('p')).textContent = text;
        }
        const trusted = await new ConfirmDialog({ title: 'Unknown SSH host', msg, ok: 'Trust', cancel: 'Reject' }).open();
        return trusted === true;
    }
}
