/**
 * How the dashboard reaches a gempba center: LOCAL (this machine, no SSH), HOST (a VM over SSH),
 * or JUMP (a compute node through a login node, often behind MFA).
 */
export enum ConnectionMode {
    LOCAL = 'LOCAL',
    HOST = 'HOST',
    JUMP = 'JUMP'
}
