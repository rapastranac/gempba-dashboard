const fs = require('fs');
const path = require('path');

/**
 * The README's and ARCHITECTURE.md's diagrams, drawn as SVG from fixed coordinates so that no arrow crosses another or
 * runs under a box. Each is drawn once, in fixed light colors on its own white background, so it reads the same in any
 * theme and any Markdown viewer. Run `npm run diagrams` after changing one; a spec checks the files in `docs/diagrams` match.
 */

const COLORS = {
    page: '#ffffff', text: '#1f2328', muted: '#59636e', line: '#59636e', group: '#d0d7de', groupText: '#59636e',
    kinds: {
        plain: ['#f6f8fa', '#d0d7de'], hub: ['#e3f4f4', '#1a7f80'], feature: ['#eaf5ea', '#2f8a3a'], kernel: ['#fbf3dc', '#9a6700'],
        theia: ['#f1ecfb', '#8250df'], external: ['#eef4fb', '#0969da'], live: ['#e7f6ea', '#1a7f37'], paused: ['#f3edfb', '#8250df'],
        ended: ['#eff1f3', '#59636e'], stale: ['#fbf3dc', '#9a6700'], off: ['#f6f8fa', '#818b98'], bad: ['#ffebe9', '#cf222e'], good: ['#e7f6ea', '#1a7f37']
    }
};

const FONT = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const CODE = "ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace";

const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A row's words, with the parts in backticks set in the code font. */
function words(row) {
    return row.split('`').map((part, index) => (index % 2 === 1 ? `<tspan font-family="${CODE}">${escape(part)}</tspan>` : escape(part))).join('');
}

/** About how wide a row of 12px text is: the code font runs wider than the text font. */
function widthOf(row) {
    return row.split('`').reduce((width, part, index) => width + part.length * (index % 2 === 1 ? 7.3 : 6.6), 0);
}

/** Lines of text anchored on `x`, the first at `y`. */
function lines(x, y, rows, size, fill, weight = 400, anchor = 'middle') {
    return rows.map((row, index) => `<text x="${x}" y="${y + index * (size + 4)}" font-size="${size}" font-weight="${weight}" fill="${fill}"`
        + ` text-anchor="${anchor}">${words(row)}</text>`).join('');
}

/** A box with a title and lines under it, filled by its kind; `dashed` for something present in development builds only. */
function box({ x, y, w, h, title, sub = [], kind = 'plain', dashed = false }) {
    const [fill, stroke] = COLORS.kinds[kind];
    const rows = [title, ...sub];
    const top = y + h / 2 - ((rows.length - 1) * 17) / 2 + 5;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${dashed ? ' stroke-dasharray="6 4"' : ''}/>`
        + lines(x + w / 2, top, [title], 14, COLORS.text, 600)
        + lines(x + w / 2, top + 18, sub, 12, COLORS.muted);
}

/** A labelled frame around a set of boxes: a process, or a part of the system. */
function group({ x, y, w, h, label }) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="none" stroke="${COLORS.group}" stroke-width="1.5" stroke-dasharray="4 4"/>`
        + `<text x="${x + 14}" y="${y + 20}" font-size="12" font-weight="600" fill="${COLORS.groupText}" letter-spacing="0.06em">${escape(label.toUpperCase())}</text>`;
}

/** An arrow along straight segments through `points`, with its head at the last; `both` heads both ends; `dashed` for an indirect link. */
function arrow({ points, dashed = false, both = false, color }) {
    const stroke = color ?? COLORS.line;
    const d = points.map(([px, py], index) => `${index === 0 ? 'M' : 'L'}${px} ${py}`).join(' ');
    return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.6"${dashed ? ' stroke-dasharray="6 4"' : ''}`
        + ` marker-end="url(#head-${markerOf(stroke)})"${both ? ` marker-start="url(#tail-${markerOf(stroke)})"` : ''}/>`;
}

/**
 * Words beside an arrow, on the page colour: a label set 8px above a line clears it, and one set 4px below a line's
 * level sits on it and breaks it, as an inline label.
 */
function label({ x, y, rows, anchor = 'middle', color }) {
    const width = Math.max(...rows.map(widthOf)) + 10;
    const left = anchor === 'middle' ? x - width / 2 : anchor === 'start' ? x - 5 : x - width + 5;
    return `<rect x="${left}" y="${y - 12}" width="${width}" height="${rows.length * 16}" fill="${COLORS.page}"/>`
        + lines(x, y, rows, 12, color ?? COLORS.muted, 400, anchor);
}

function markerOf(color) {
    return color.replace('#', '');
}

function markers(colors) {
    return [...new Set(colors)].map(color => `<marker id="head-${markerOf(color)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">`
        + `<path d="M0 0 L10 5 L0 10 z" fill="${color}"/></marker>`
        + `<marker id="tail-${markerOf(color)}" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto">`
        + `<path d="M10 0 L0 5 L10 10 z" fill="${color}"/></marker>`).join('');
}

/** Renders one diagram: its parts are drawn in order, groups first. */
function render(diagram) {
    const parts = diagram.parts;
    const colors = [COLORS.line, ...Object.values(COLORS.kinds).map(([, stroke]) => stroke)];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${diagram.width}" height="${diagram.height}" viewBox="0 0 ${diagram.width} ${diagram.height}"`
        + ` font-family="${FONT}" role="img" aria-label="${escape(diagram.title)}">\n`
        + `<title>${escape(diagram.title)}</title>\n<defs>${markers(colors)}</defs>\n`
        + `<rect width="${diagram.width}" height="${diagram.height}" fill="${COLORS.page}"/>\n`
        + parts.join('\n') + '\n</svg>\n';
}

/** How the dashboard reaches a gempba run: Local, Host and Jump host. */
const reach = {
    title: 'How the dashboard reaches a gempba run: over TCP on this machine, over SSH to a VM, or over SSH through a login node to a compute node',
    width: 900, height: 300,
    parts: [
        box({ x: 20, y: 20, w: 190, h: 260, title: 'GemPBA Dashboard', sub: ['on your machine'], kind: 'hub' }),
        label({ x: 232, y: 62, rows: ['Local'], anchor: 'start', color: COLORS.text }),
        arrow({ points: [[210, 70], [640, 70]] }),
        label({ x: 425, y: 62, rows: ['TCP'] }),
        box({ x: 640, y: 40, w: 240, h: 60, title: 'gempba rank 0', sub: ['`127.0.0.1:9000`'], kind: 'external' }),
        label({ x: 232, y: 152, rows: ['Host'], anchor: 'start', color: COLORS.text }),
        arrow({ points: [[210, 160], [640, 160]] }),
        label({ x: 440, y: 152, rows: ['SSH: one sign-in, then a forward'] }),
        box({ x: 640, y: 130, w: 240, h: 60, title: 'gempba rank 0', sub: ['on a VM'], kind: 'external' }),
        label({ x: 232, y: 242, rows: ['Jump host'], anchor: 'start', color: COLORS.text }),
        arrow({ points: [[210, 250], [380, 250]] }),
        label({ x: 295, y: 272, rows: ['SSH: keys, MFA'] }),
        box({ x: 380, y: 220, w: 150, h: 60, title: 'login node', sub: ['the cluster'], kind: 'plain' }),
        arrow({ points: [[530, 250], [640, 250]] }),
        label({ x: 585, y: 242, rows: ['`ssh -N -L`'] }),
        label({ x: 585, y: 272, rows: ['its own trust'] }),
        box({ x: 640, y: 220, w: 240, h: 60, title: 'gempba rank 0', sub: ['on a compute node'], kind: 'external' })
    ]
};

/** The app's three processes, the packages in each, and what crosses between them. */
const processes = {
    title: 'How the app runs: the backend holds the TCP and SSH connections, the frontend draws the views, Electron main owns the windows',
    width: 1080, height: 560,
    parts: [
        group({ x: 240, y: 20, w: 300, h: 520, label: 'Backend: Node.js' }),
        group({ x: 660, y: 20, w: 400, h: 520, label: 'Frontend: the window' }),
        group({ x: 20, y: 360, w: 190, h: 180, label: 'Electron main' }),
        box({ x: 20, y: 200, w: 190, h: 70, title: 'gempba run', sub: ['telemetry on rank 0'], kind: 'external' }),
        box({ x: 260, y: 45, w: 260, h: 80, title: '@gempba/telemetry', sub: ['TelemetryServer: TCP client,', 'wire protocol, store, mapper'], kind: 'hub' }),
        box({ x: 260, y: 200, w: 260, h: 70, title: '@gempba/auth', sub: ['SSH session, HOST and JUMP tunnels'], kind: 'feature' }),
        box({ x: 260, y: 440, w: 260, h: 70, title: '@gempba/controls', sub: ['SettingsStore: ~/.gempba-dashboard'], kind: 'feature' }),
        box({ x: 680, y: 45, w: 360, h: 80, title: '@gempba/telemetry', sub: ['TelemetryService, histories,', 'commands, status bar'], kind: 'hub' }),
        box({ x: 680, y: 170, w: 170, h: 70, title: '@gempba/grid', sub: ['one tile per node'], kind: 'feature' }),
        box({ x: 870, y: 170, w: 170, h: 70, title: '@gempba/cards', sub: ['tree and details'], kind: 'feature' }),
        box({ x: 680, y: 270, w: 170, h: 70, title: '@gempba/auth', sub: ['MFA, passphrase,', 'host-key prompts'], kind: 'feature' }),
        box({ x: 870, y: 270, w: 170, h: 70, title: '@gempba/shell', sub: ['branding,', 'IDE parts stripped'], kind: 'theia' }),
        box({ x: 680, y: 380, w: 170, h: 70, title: '@gempba/controls', sub: ['Connection view'], kind: 'feature' }),
        box({ x: 35, y: 410, w: 160, h: 80, title: '@gempba/shell', sub: ['window icon,', 'background throttling'], kind: 'theia' }),
        arrow({ points: [[115, 200], [115, 85], [260, 85]], both: true }),
        label({ x: 130, y: 62, rows: ['TCP: lines in,', 'controls out'], anchor: 'start' }),
        arrow({ points: [[390, 125], [390, 200]], dashed: true }),
        label({ x: 398, y: 156, rows: ['HOST, JUMP: dials a', "tunnel's local port"], anchor: 'start' }),
        arrow({ points: [[260, 235], [210, 235]], dashed: true }),
        label({ x: 235, y: 227, rows: ['SSH'] }),
        arrow({ points: [[520, 85], [680, 85]] }),
        label({ x: 600, y: 77, rows: ['WorldSnapshot'] }),
        label({ x: 600, y: 105, rows: ['JSON-RPC'] }),
        arrow({ points: [[765, 125], [765, 170]] }),
        arrow({ points: [[955, 125], [955, 170]] }),
        label({ x: 860, y: 152, rows: ['onSnapshot'] }),
        arrow({ points: [[520, 235], [610, 235], [610, 305], [680, 305]], dashed: true }),
        label({ x: 600, y: 330, rows: ['prompts', 'over', 'JSON-RPC'] }),
        arrow({ points: [[850, 415], [1050, 415], [1050, 110], [1040, 110]] }),
        label({ x: 950, y: 407, rows: ['connect, listen, rate, run'] }),
        arrow({ points: [[680, 430], [580, 430], [580, 475], [520, 475]], dashed: true }),
        label({ x: 630, y: 422, rows: ['settings'] })
    ]
};

/** The packages: the features down the middle, the hub and the UI kit beside them, the kernel and Theia below. */
const packages = {
    title: 'The packages: features depend on the telemetry hub, the views on the UI kit too, the hub on the kernel;'
        + ' every package but the kernel builds on Theia',
    width: 980, height: 640,
    parts: [
        box({ x: 260, y: 20, w: 480, h: 56, title: '@gempba/electron-app', sub: ['the product: lists every package below'], kind: 'plain' }),
        box({ x: 300, y: 110, w: 180, h: 56, title: '@gempba/auth', sub: ['SSH, HOST and JUMP'], kind: 'feature' }),
        box({ x: 300, y: 190, w: 180, h: 56, title: '@gempba/controls', sub: ['Connection view'], kind: 'feature' }),
        box({ x: 300, y: 270, w: 180, h: 56, title: '@gempba/grid', sub: ['one tile per node'], kind: 'feature' }),
        box({ x: 300, y: 350, w: 180, h: 56, title: '@gempba/cards', sub: ['tree and details'], kind: 'feature' }),
        box({ x: 300, y: 430, w: 180, h: 56, title: '@gempba/mock', sub: ['development builds only'], kind: 'feature', dashed: true }),
        box({
            x: 560, y: 110, w: 180, h: 376, title: '@gempba/telemetry',
            sub: ['the hub:', 'TelemetryService,', 'histories, commands,', 'live controls,', 'TunnelProvider'], kind: 'hub'
        }),
        box({ x: 800, y: 244, w: 160, h: 108, title: '@gempba/core', sub: ['read-model,', 'formatters, policies;', 'no Theia; features', 'use its types too'], kind: 'kernel' }),
        box({ x: 40, y: 190, w: 180, h: 216, title: '@gempba/ui', sub: ['the UI kit: tiles,', 'charts, gauges,', 'panels, themes'], kind: 'plain' }),
        box({ x: 40, y: 440, w: 180, h: 56, title: '@gempba/plugins', sub: ['VS Code plugins'], kind: 'theia' }),
        box({ x: 40, y: 520, w: 180, h: 56, title: '@gempba/shell', sub: ['branding, IDE stripped'], kind: 'theia' }),
        box({ x: 20, y: 596, w: 940, h: 36, title: 'Theia platform: every package but @gempba/core builds on it', kind: 'theia' }),
        ...[138, 218, 298, 378, 458].map(y => arrow({ points: [[480, y], [560, y]], dashed: y === 458 })),
        ...[218, 298, 378].map(y => arrow({ points: [[300, y], [220, y]] })),
        arrow({ points: [[130, 440], [130, 406]] }),
        arrow({ points: [[130, 496], [130, 520]] }),
        arrow({ points: [[740, 298], [800, 298]] })
    ]
};

/** The extensions plug into the hub, never into each other. */
const extensions = {
    title: 'How extensions connect: each feature depends on the telemetry hub, the views on the UI kit too, and the hub on the kernel',
    width: 900, height: 420,
    parts: [
        box({ x: 260, y: 20, w: 180, h: 56, title: '@gempba/auth', sub: ['adds HOST, JUMP'], kind: 'feature' }),
        box({ x: 260, y: 100, w: 180, h: 56, title: '@gempba/controls', sub: ['Connection view'], kind: 'feature' }),
        box({ x: 260, y: 180, w: 180, h: 56, title: '@gempba/grid', sub: ['one tile per node'], kind: 'feature' }),
        box({ x: 260, y: 260, w: 180, h: 56, title: '@gempba/cards', sub: ['tree and details'], kind: 'feature' }),
        box({ x: 260, y: 340, w: 180, h: 56, title: '@gempba/mock', sub: ['built-in mocker'], kind: 'feature', dashed: true }),
        box({ x: 520, y: 20, w: 170, h: 376, title: '@gempba/telemetry', sub: ['the hub:', 'TelemetryService,', 'commands,', 'live controls,', 'TunnelProvider'], kind: 'hub' }),
        box({ x: 740, y: 154, w: 140, h: 108, title: '@gempba/core', sub: ['read-model,', 'no Theia; features', 'use its types too'], kind: 'kernel' }),
        box({ x: 20, y: 100, w: 160, h: 216, title: '@gempba/ui', sub: ['the UI kit:', 'tiles, charts,', 'gauges, panels,', 'theme colors'], kind: 'plain' }),
        ...[48, 128, 208, 288, 368].map(y => arrow({ points: [[440, y], [520, y]], dashed: y === 368 })),
        ...[128, 208, 288].map(y => arrow({ points: [[260, y], [180, y]] })),
        arrow({ points: [[690, 208], [740, 208]] })
    ]
};

/** A line's way from gempba's ranks to the views, and the controls' way back. */
const dataPath = {
    title: 'The data path: rank frames reach rank 0, which sends one line per interval; the backend maps it to a WorldSnapshot for the window,'
        + ' where the hub keeps the histories the views draw; the controls go back the same way',
    width: 980, height: 600,
    parts: [
        group({ x: 20, y: 20, w: 440, h: 150, label: 'A gempba run' }),
        group({ x: 20, y: 200, w: 880, h: 150, label: 'Backend: Node.js' }),
        group({ x: 20, y: 380, w: 880, h: 200, label: 'Frontend: the window' }),
        box({ x: 40, y: 50, w: 100, h: 30, title: 'rank 1', kind: 'external' }),
        box({ x: 40, y: 88, w: 100, h: 30, title: 'rank 2', kind: 'external' }),
        box({ x: 40, y: 126, w: 100, h: 30, title: 'rank N', kind: 'external' }),
        arrow({ points: [[140, 65], [170, 65], [170, 103], [200, 103]] }),
        arrow({ points: [[140, 103], [200, 103]] }),
        arrow({ points: [[140, 141], [170, 141], [170, 103], [200, 103]] }),
        box({ x: 200, y: 70, w: 220, h: 66, title: 'rank 0: the aggregator', sub: ['one line per interval,', 'on a loopback port'], kind: 'external' }),
        box({ x: 40, y: 240, w: 190, h: 90, title: 'TelemetryClient', sub: ['TCP, one JSON line', 'at a time; retries', 'on its own'], kind: 'hub' }),
        box({ x: 250, y: 240, w: 190, h: 90, title: 'TelemetryStore', sub: ['last topology; a paused', "line's header; a new", 'run starts afresh'], kind: 'hub' }),
        box({ x: 460, y: 240, w: 190, h: 90, title: 'WorldSnapshotMapper', sub: ['wire keys to the', 'read-model, the', 'only place that does'], kind: 'hub' }),
        box({ x: 670, y: 240, w: 190, h: 90, title: 'TelemetryServer', sub: ['the link and why it', 'stopped; sends the', 'controls back'], kind: 'hub' }),
        box({ x: 40, y: 410, w: 190, h: 90, title: 'Connection view', sub: ['and the commands:', 'Listen, rate, Pause,', 'Snapshot, Mark…'], kind: 'feature' }),
        box({ x: 250, y: 410, w: 190, h: 90, title: 'Views', sub: ['Grid, Cards,', 'status bar'], kind: 'feature' }),
        box({ x: 460, y: 410, w: 190, h: 90, title: 'History stores', sub: ['rates, totals, CPU,', 'memory per rank', 'and per node'], kind: 'hub' }),
        box({ x: 670, y: 410, w: 190, h: 90, title: 'TelemetryService', sub: ['condition, Clear,', 'refresh rate,', 'run controls'], kind: 'hub' }),
        arrow({ points: [[215, 136], [215, 240]] }),
        label({ x: 230, y: 190, rows: ['TCP: one JSON line per interval'], anchor: 'start' }),
        arrow({ points: [[230, 285], [250, 285]] }),
        arrow({ points: [[440, 285], [460, 285]] }),
        arrow({ points: [[650, 285], [670, 285]] }),
        arrow({ points: [[740, 330], [740, 410]] }),
        label({ x: 732, y: 369, rows: ['WorldSnapshot'], anchor: 'end' }),
        arrow({ points: [[800, 410], [800, 330]], dashed: true }),
        label({ x: 808, y: 369, rows: ['controls'], anchor: 'start' }),
        arrow({ points: [[670, 455], [650, 455]] }),
        arrow({ points: [[460, 455], [440, 455]] }),
        arrow({ points: [[135, 500], [135, 545], [800, 545], [800, 500]], dashed: true }),
        label({ x: 470, y: 537, rows: ['connect, listen, rate, run controls'] }),
        arrow({ points: [[860, 285], [940, 285], [940, 103], [420, 103]], dashed: true }),
        label({ x: 690, y: 79, rows: ['the controls, on the same socket:', '`set_interval_ms`, pause, resume, snapshot, mark'] })
    ]
};

/** What the views say about the data they hold. */
const conditions = {
    title: "The stream's conditions: no data until a run's first frame; live, paused, reconnecting and ended while listening;"
        + ' stopped, disconnected and lost once not; Clear or a new Listen empties the views',
    width: 1020, height: 470,
    parts: [
        group({ x: 200, y: 20, w: 470, h: 330, label: 'Listening' }),
        group({ x: 800, y: 20, w: 200, h: 330, label: 'Not listening' }),
        box({ x: 20, y: 160, w: 140, h: 60, title: 'No data', sub: ['empty views'], kind: 'off' }),
        box({ x: 260, y: 160, w: 140, h: 60, title: 'Live', sub: ['frames arrive'], kind: 'live' }),
        box({ x: 260, y: 50, w: 140, h: 60, title: 'Paused', sub: ['header-only lines'], kind: 'paused' }),
        box({ x: 260, y: 270, w: 140, h: 60, title: 'Reconnecting', sub: ['the client retries'], kind: 'stale' }),
        box({ x: 500, y: 160, w: 150, h: 60, title: 'Run ended', sub: ["the run's final line"], kind: 'ended' }),
        box({ x: 820, y: 60, w: 160, h: 60, title: 'Stopped', sub: ['you stopped listening'], kind: 'off' }),
        box({ x: 820, y: 160, w: 160, h: 60, title: 'Disconnected', sub: ['you disconnected'], kind: 'off' }),
        box({ x: 820, y: 260, w: 160, h: 60, title: 'Connection lost', sub: ['the SSH session closed'], kind: 'off' }),
        arrow({ points: [[160, 190], [260, 190]] }),
        label({ x: 210, y: 182, rows: ['first frame'] }),
        arrow({ points: [[310, 160], [310, 110]] }),
        label({ x: 302, y: 140, rows: ['Pause'], anchor: 'end' }),
        arrow({ points: [[350, 110], [350, 160]] }),
        label({ x: 358, y: 140, rows: ['Resume'], anchor: 'start' }),
        arrow({ points: [[310, 220], [310, 270]] }),
        label({ x: 302, y: 250, rows: ['link drops'], anchor: 'end' }),
        arrow({ points: [[350, 270], [350, 220]] }),
        label({ x: 358, y: 250, rows: ['link back'], anchor: 'start' }),
        arrow({ points: [[400, 180], [500, 180]] }),
        label({ x: 450, y: 172, rows: ['final line'] }),
        arrow({ points: [[500, 205], [400, 205]] }),
        label({ x: 450, y: 225, rows: ['next run'] }),
        arrow({ points: [[670, 90], [820, 90]] }),
        label({ x: 735, y: 82, rows: ['Stop'] }),
        arrow({ points: [[670, 190], [820, 190]] }),
        label({ x: 735, y: 182, rows: ['Disconnect'] }),
        arrow({ points: [[670, 290], [820, 290]] }),
        label({ x: 735, y: 282, rows: ['session closes'] }),
        arrow({ points: [[900, 350], [900, 420], [90, 420], [90, 220]], dashed: true }),
        label({ x: 495, y: 412, rows: ['Clear, or a new Listen: the views empty'] }),
        label({ x: 510, y: 452, rows: ['Every condition but Live and Paused is frozen data: kept as it was, dimmed, under a bar that says why.'], color: COLORS.text })
    ]
};

/** Why JUMP runs the hop on the login node rather than using ProxyJump. */
const jump = {
    title: 'JUMP next to ProxyJump: with ProxyJump this machine signs in to the compute node, which refuses it;'
        + " JUMP signs in to the login node, which runs the hop to the compute node with the cluster's own trust",
    width: 900, height: 400,
    parts: [
        group({ x: 20, y: 20, w: 860, h: 170, label: 'ProxyJump (ssh -J): refused' }),
        group({ x: 20, y: 210, w: 860, h: 170, label: 'JUMP: the hop runs on the login node' }),
        box({ x: 40, y: 80, w: 170, h: 60, title: 'your machine', kind: 'hub' }),
        box({ x: 360, y: 80, w: 170, h: 60, title: 'login node', sub: ['relays TCP only'], kind: 'plain' }),
        box({ x: 680, y: 80, w: 180, h: 60, title: 'compute node', sub: ['trusts login nodes only'], kind: 'bad' }),
        arrow({ points: [[210, 110], [360, 110]] }),
        arrow({ points: [[530, 110], [680, 110]] }),
        label({ x: 285, y: 102, rows: ['TCP'] }),
        label({ x: 605, y: 102, rows: ['TCP'] }),
        arrow({ points: [[125, 140], [125, 170], [770, 170], [770, 140]], dashed: true, color: COLORS.kinds.bad[1] }),
        label({ x: 450, y: 174, rows: ["SSH handshake: your key is refused, it asks for a password you don't have"], color: COLORS.kinds.bad[1] }),
        box({ x: 40, y: 270, w: 170, h: 60, title: 'your machine', sub: ['the dashboard'], kind: 'hub' }),
        box({ x: 360, y: 270, w: 170, h: 60, title: 'login node', sub: ['runs `ssh -N -L` on a PTY'], kind: 'plain' }),
        box({ x: 680, y: 270, w: 180, h: 60, title: 'compute node', sub: ['gempba rank 0'], kind: 'good' }),
        arrow({ points: [[210, 300], [360, 300]] }),
        label({ x: 285, y: 292, rows: ['SSH: keys, MFA'] }),
        label({ x: 285, y: 322, rows: ['one sign-in'] }),
        arrow({ points: [[530, 300], [680, 300]], color: COLORS.kinds.good[1] }),
        label({ x: 605, y: 292, rows: ["the cluster's"], color: COLORS.kinds.good[1] }),
        label({ x: 605, y: 322, rows: ['own trust'], color: COLORS.kinds.good[1] }),
        label({ x: 450, y: 362, rows: ["Closing the channel hangs the hop up; the forward carries gempba's port back to your machine."] })
    ]
};

const DIAGRAMS = { reach, processes, packages, extensions, 'data-path': dataPath, conditions, jump };
const OUT = path.resolve(__dirname, '..', 'docs', 'diagrams');

/** Every file this script writes, by name, with its contents. */
function files() {
    const out = {};
    for (const [name, diagram] of Object.entries(DIAGRAMS)) {
        out[`${name}.svg`] = render(diagram);
    }
    return out;
}

module.exports = { files, OUT };

if (require.main === module) {
    fs.mkdirSync(OUT, { recursive: true });
    for (const [name, svg] of Object.entries(files())) {
        fs.writeFileSync(path.join(OUT, name), svg);
    }
    console.log(`Wrote ${Object.keys(files()).length} diagrams to docs/diagrams.`);
}
