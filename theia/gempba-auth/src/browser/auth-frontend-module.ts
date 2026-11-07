import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { ContainerModule, inject, injectable } from '@theia/core/shared/inversify';
import { AUTH_PROMPT_PATH } from '../common/auth-prompt';
import { AuthPromptImpl } from './auth-prompt-impl';

/** Creating the prompt at startup registers it as the handler the backend's prompt proxy talks to. */
@injectable()
class AuthPromptRegistration implements FrontendApplicationContribution {

    @inject(AuthPromptImpl) protected readonly prompt: AuthPromptImpl;

    initialize(): void {
        // Injection alone activates the prompt; nothing else to start.
    }
}

export default new ContainerModule(bind => {
    bind(AuthPromptImpl).toSelf().inSingletonScope().onActivation(({ container }, prompt) => {
        ServiceConnectionProvider.createHandler(container, AUTH_PROMPT_PATH, prompt);
        return prompt;
    });
    bind(FrontendApplicationContribution).to(AuthPromptRegistration).inSingletonScope();
});
