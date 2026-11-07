import { injectable } from '@theia/core/shared/inversify';
import { AIActivationServiceImpl, ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser/ai-activation-service';

/**
 * Keeps Theia's AI features off. The plugin runtime brings in the AI packages, and without Theia's AI IDE package
 * they would count as active.
 */
@injectable()
export class InactiveAiActivationService extends AIActivationServiceImpl {

    override isActive = false;
    override canRun = false;

    override initialize(): void {
        this.contextKeyService.createKey(ENABLE_AI_CONTEXT_KEY, false);
    }
}
