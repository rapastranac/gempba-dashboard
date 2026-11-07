/**
 * A node picked in one view, published through Theia's SelectionService so any other view can follow it
 * without importing the view that published it.
 */
export interface NodeSelection {
    readonly kind: 'gempba.node';
    readonly host: string;
}

export namespace NodeSelection {

    export function of(host: string): NodeSelection {
        return { kind: 'gempba.node', host };
    }

    export function is(selection: unknown): selection is NodeSelection {
        return typeof selection === 'object' && selection !== null
            && (selection as NodeSelection).kind === 'gempba.node' && typeof (selection as NodeSelection).host === 'string';
    }
}
