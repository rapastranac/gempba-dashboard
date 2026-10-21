import { NumberText } from './number-text';

const SUFFIXES = ['KB', 'MB', 'GB', 'TB'];

export namespace Bytes {

    /** `0 B`, `512 B`, `1.5 KB`, `3.0 GB`, … (binary, one decimal, saturating at TB). */
    export function human(bytes: number): string {
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        let value = bytes;
        let index = -1;
        do {
            value /= 1024;
            index++;
        } while (value >= 1024 && index < SUFFIXES.length - 1);
        return `${NumberText.fixed(value, 1)} ${SUFFIXES[index]}`;
    }
}
