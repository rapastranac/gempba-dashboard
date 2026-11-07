import { injectable } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

/**
 * Starts every window without a workspace. The dashboard opens no files or folders, so it ignores the most recent
 * workspace, which Theia would otherwise reopen, and any workspace path in the window's URL.
 */
@injectable()
export class ShellWorkspaceService extends WorkspaceService {

    protected override getDefaultWorkspaceUri(): undefined {
        return undefined;
    }
}
