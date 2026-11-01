// Boots a packaged app and fails unless it reaches the GemPBA Dashboard shell without a single frontend error, shows
// only the dashboard's menus, side-bar views and status-bar items, and loads a plugin: the fixture theme in
// fixtures/plugins, deployed through THEIA_DEFAULT_PLUGINS, must register its color theme.
// Usage: node configs/smoke-test.js <the packaged app's executable>
// The release workflow runs it on every OS after packaging; on Linux, under xvfb-run.
const { spawn, execSync } = require('child_process');
const path = require('path');

const PORT = 9333;
const START_TIMEOUT_MS = 120_000;
const SETTLE_MS = 8_000;
const PLUGIN_TIMEOUT_MS = 30_000;
const TITLE = 'GemPBA Dashboard';
const FIXTURE_PLUGINS = path.join(__dirname, 'fixtures', 'plugins');
const FIXTURE_THEME = 'gempba-smoke-theme';
// Node's deprecation warnings about a dependency's use of its API: Theia relays the plugin host's stderr to the
// console as errors, but they are not the app failing.
const NODE_DEPRECATION = /\(node:\d+\) \[DEP\d+\] DeprecationWarning:/;
// What the dashboard shows. The menu bar is in the page only with Theia's own title bar; with a native one (macOS),
// the menus are the OS's and are not checked.
const MENUS = ['File', 'Edit', 'View', 'Help'];
// The development-only Mock panel opens on a fresh layout, so an installer that shipped the mocker fails this.
const SIDE_BAR_VIEWS = ['gempba-connection', 'vsx-extensions-view-container'];
const STATUS_BAR_ITEMS = ['status-bar-gempba-telemetry-status', 'status-bar-theia-notification-center'];
/** Runs in the page: what the shell shows, and the color themes registered (Theia caches each one in IndexedDB). */
async function inventory() {
    const tabs = selector => [...document.querySelectorAll(`${selector} .lm-TabBar-tab`)]
        .map(tab => tab.id.replace(/^shell-tab-/, ''))
        .filter(id => !id.endsWith('-hidden'));
    const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('theia-monaco');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    const themes = !db.objectStoreNames.contains('themes') ? [] : await new Promise(resolve => {
        const request = db.transaction('themes').objectStore('themes').getAllKeys();
        request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return {
        menus: [...document.querySelectorAll('.lm-MenuBar-item')].map(item => item.innerText.trim()),
        left: tabs('.theia-app-left'),
        right: tabs('.theia-app-right'),
        bottom: tabs('#theia-bottom-content-panel'),
        statusBar: [...document.querySelectorAll('#theia-statusBar .element')].map(element => element.id),
        themes
    };
}
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
            const text = message.params.args.map(arg => arg.value ?? arg.description).join(' ');
            if (!NODE_DEPRECATION.test(text)) {
                errors.push(text);
            }
        } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error' && !NODE_DEPRECATION.test(message.params.entry.text)) {
            errors.push(`${message.params.entry.text} (${message.params.entry.url ?? message.params.entry.source})`);
        }
    });
    await send('Runtime.enable');
    await send('Log.enable');
    return { send, close: () => socket.close() };
}

/** Compares what the shell shows with what the dashboard should, giving the fixture plugin time to register its theme. */
async function checkShell(session) {
    const deadline = Date.now() + PLUGIN_TIMEOUT_MS;
    let shown;
    while (Date.now() < deadline) {
        const reply = await session.send('Runtime.evaluate', { expression: `(${inventory})()`, returnByValue: true, awaitPromise: true });
        shown = reply.result?.result?.value;
        if (shown?.themes.includes(FIXTURE_THEME)) {
            break;
        }
        await wait(1000);
    }
    if (!shown) {
        return ['could not read what the shell shows'];
    }
    const sorted = list => JSON.stringify([...list].sort());
    const problems = [];
    if (shown.menus.length > 0 && JSON.stringify(shown.menus) !== JSON.stringify(MENUS)) {
        problems.push(`the menus are ${JSON.stringify(shown.menus)}, not ${JSON.stringify(MENUS)}`);
    }
    if (sorted(shown.left) !== sorted(SIDE_BAR_VIEWS)) {
        problems.push(`the side bar shows ${JSON.stringify(shown.left)}, not ${JSON.stringify(SIDE_BAR_VIEWS)}`);
    }
    if (shown.right.length > 0 || shown.bottom.length > 0) {
        problems.push(`views outside the left side bar: ${JSON.stringify([...shown.right, ...shown.bottom])}`);
    }
    const unexpected = shown.statusBar.filter(id => !STATUS_BAR_ITEMS.includes(id));
    if (unexpected.length > 0) {
        problems.push(`unexpected status-bar items: ${unexpected.join(', ')}`);
    }
    if (!shown.themes.includes(FIXTURE_THEME)) {
        problems.push(`the fixture plugin did not register its theme ${FIXTURE_THEME} within ${PLUGIN_TIMEOUT_MS / 1000} s`);
    }
    return problems;
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
    const env = { ...process.env, THEIA_DEFAULT_PLUGINS: `local-dir:${FIXTURE_PLUGINS}` };
    const app = spawn(executable, args, { stdio: 'inherit', detached: process.platform !== 'win32', env });
    const errors = [];
    const problems = [];
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
            problems.push(...await checkShell(session));
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
    for (const problem of problems) {
        console.error(`FAIL: ${problem}`);
    }
    if (!up || errors.length > 0 || problems.length > 0) {
        process.exit(1);
    }
    console.log(`OK: the ${TITLE} shell is up with no frontend errors, only the dashboard's views, and the fixture plugin's theme`);
}

main().catch(error => {
    console.error(`FAIL: ${error.message}`);
    process.exit(1);
});
