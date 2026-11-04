/**
 * What gempba's task counters are called wherever they show, and what each one counts, for tooltips. Work a process
 * runs itself is told apart from work that moves between processes, and each name points at the field of gempba's
 * own end-of-run report that counts the same thing.
 */
export namespace TaskWords {

    export const STARTED = 'Tasks started';
    export const SENT = 'Tasks sent';
    export const RECEIVED = 'Tasks received';

    export const STARTED_HINT = 'Subtrees a process handed to its own threads, those it received included, counted as each is handed over. '
        + 'The gempba report calls it total_thread_requests.';
    export const SENT_HINT = 'Subtrees a process shipped to another process. The gempba report calls it sent_task_count.';
    export const RECEIVED_HINT = 'Subtrees that arrived from another process. The gempba report calls it received_task_count.';
}
