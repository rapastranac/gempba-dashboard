// Boots a packaged app and fails unless it reaches the GemPBA Dashboard shell without a single frontend error.
// Usage: node configs/smoke-test.js <the packaged app's executable>
// The release workflow runs it on every OS after packaging; on Linux, under xvfb-run.
const { spawn, execSync } = require('child_process');

const PORT = 9333;
const START_TIMEOUT_MS = 120_000;
const SETTLE_MS = 8_000;
const TITLE = 'GemPBA Dashboard';
// The shell counts as up once GemPBA's own views have rendered in it. Not the window title: on macOS, as in VS Code,
// Theia leaves the app name out of it, so it reads just the active view, e.g. "Grid".
const STATE = '({ shell: !!document.querySelector(\'#theia-app-shell\'), gempba: !!document.querySelector(\'.gempba-grid, .gempba-connection-form\'), '
    + 'title: document.title, url: location.href, ready: document.readyState })';

const executable = process.argv[2];
if (!executable) {
    console.error('usage: node configs/smoke-test.js <executable>');
    process.exit(2);
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function targets() {
    try {
        return await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    } catch {
        return [];
    }
}

async function findPage(deadline) {
    while (Date.now() < deadline) {
        const page = (await targets()).find(target => target.type === 'page' && /index\.html/.test(target.url));
        if (page) {
            return page;
        }
        await wait(500);
    }
    return undefined;
}

/** A DevTools session on one page; replies come back whole, so a CDP error is seen rather than taken for "not ready". */
async function attach(page, errors) {
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    let id = 0;
    const send = (method, params = {}) => new Promise(resolve => {
        const myId = ++id;
        const onMessage = event => {
            const message = JSON.parse(event.data);
            if (message.id === myId) {
                socket.removeEventListener('message', onMessage);
                resolve(message);
            }
        };
        socket.addEventListener('message', onMessage);
        socket.send(JSON.stringify({ id: myId, method, params }));
    });
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.method === 'Runtime.exceptionThrown') {
            errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
        } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
            errors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '));
        } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
            errors.push(`${message.params.entry.text} (${message.params.entry.url ?? message.params.entry.source})`);
        }
    });
    await send('Runtime.enable');
    await send('Log.enable');
    return { send, close: () => socket.close() };
}

function stop(app) {
    if (process.platform === 'win32') {
        try {
            execSync(`taskkill /pid ${app.pid} /T /F`, { stdio: 'ignore' });
        } catch {
            // Already gone.
        }
    } else {
        try {
            process.kill(-app.pid, 'SIGKILL');
        } catch {
            // Already gone.
        }
    }
}

async function main() {
    const args = [`--remote-debugging-port=${PORT}`];
    if (process.platform === 'linux') {
        args.push('--no-sandbox');
    }
    const app = spawn(executable, args, { stdio: 'inherit', detached: process.platform !== 'win32' });
    const errors = [];
    const deadline = Date.now() + START_TIMEOUT_MS;
    let up = false;
    let last = 'no window opened';
    let session;
    try {
        while (!up && Date.now() < deadline) {
            if (!session) {
                const page = await findPage(deadline);
                if (!page) {
                    break;
                }
                session = await attach(page, errors).catch(error => {
                    last = `cannot attach to ${page.url}: ${error.message}`;
                    return undefined;
                });
                if (!session) {
                    await wait(500);
                    continue;
                }
            }
            const reply = await session.send('Runtime.evaluate', { expression: STATE, returnByValue: true });
            if (reply.error || reply.result?.exceptionDetails) {
                // The page went away or was replaced: attach to the window's page again.
                last = `evaluate failed: ${JSON.stringify(reply.error ?? reply.result.exceptionDetails)}`;
                session.close();
                session = undefined;
                await wait(500);
                continue;
            }
            const state = reply.result.result.value;
            last = JSON.stringify(state);
            up = state.shell && state.gempba;
            if (!up) {
                await wait(500);
            }
        }
        if (up) {
            await wait(SETTLE_MS);
        }
        session?.close();
    } finally {
        if (!up) {
            console.error(`targets at the end: ${JSON.stringify((await targets()).map(target => ({ type: target.type, url: target.url })))}`);
        }
        stop(app);
    }
    if (!up) {
        console.error(`FAIL: the ${TITLE} shell did not appear; last seen: ${last}`);
    }
    for (const error of errors) {
        console.error(`FAIL: frontend error: ${error}`);
    }
    if (!up || errors.length > 0) {
        process.exit(1);
    }
    console.log(`OK: the ${TITLE} shell is up with no frontend errors`);
}

main().catch(error => {
    console.error(`FAIL: ${error.message}`);
    process.exit(1);
});
