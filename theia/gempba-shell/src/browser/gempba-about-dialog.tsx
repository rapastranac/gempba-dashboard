import * as React from '@theia/core/shared/react';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AboutDialog, AboutDialogProps } from '@theia/core/lib/browser/about-dialog';

const APPLICATION_AUTHOR = 'Andres Pastrana';
const APPLICATION_LICENSE = 'MIT License';

const LINKS: readonly { label: string, url: string }[] = [
    { label: 'Documentation', url: 'https://rapastranac.github.io/gempba-docs/' },
    { label: 'GemPBA Framework on GitHub', url: 'https://github.com/rapastranac/gempba' },
    { label: 'GemPBA Dashboard on GitHub', url: 'https://github.com/rapastranac/gempba-dashboard' }
];

@injectable()
export class GemPbaAboutDialog extends AboutDialog {

    constructor(@inject(AboutDialogProps) props: AboutDialogProps) {
        super(props);
    }

    protected override renderHeader(): React.ReactNode {
        const theiaVersion = this.extensionsInfos.find(extension => extension.name === '@theia/core')?.version;
        return <div className='about-details'>
            <p>Live telemetry monitor for the GemPBA framework.</p>
            {this.applicationInfo && <p>Version {this.applicationInfo.version}</p>}
            <p>Author: {APPLICATION_AUTHOR} · {APPLICATION_LICENSE}</p>
            {theiaVersion && <p>Built on Eclipse Theia {theiaVersion}</p>}
            <ul>
                {LINKS.map(link => <li key={link.url}>
                    <a role='button' tabIndex={0} title={link.url}
                        onClick={() => this.doOpenExternalLink(link.url)}
                        onKeyDown={event => this.doOpenExternalLinkEnter(event, link.url)}>
                        {link.label}
                    </a>
                </li>)}
            </ul>
        </div>;
    }

    protected override renderExtensions(): React.ReactNode {
        return undefined;
    }
}
