/**
 * When each group's senders last sent a new frame, on this machine's clock. A group's time moves only when one of its
 * senders sends a frame it had not sent before, so a node whose workers stalled keeps its time while the stream goes on
 * repeating their latest frames.
 */
export class FrameArrivals {

    protected readonly frameBySender = new Map<string, number>();
    protected readonly lastAtByGroup = new Map<string, number>();

    /** Records that `sender`, in `group`, is at frame `frameId` as of `at`; only a frame it had not sent before moves the group's time. */
    record(group: string, sender: string, frameId: number, at: number): void {
        if (this.frameBySender.get(sender) === frameId) {
            return;
        }
        this.frameBySender.set(sender, frameId);
        this.lastAtByGroup.set(group, at);
    }

    /** When the group's latest new frame arrived, or `undefined` before any. */
    lastAt(group: string): number | undefined {
        return this.lastAtByGroup.get(group);
    }

    clear(): void {
        this.frameBySender.clear();
        this.lastAtByGroup.clear();
    }
}
