# Architecture

GemPBA Dashboard is a desktop app that shows live telemetry from the [GemPBA](https://github.com/rapastranac/gempba) parallel framework. It is built on the [Eclipse Theia](https://theia-ide.org) platform (1.76.0) and runs as an Electron app written in TypeScript.

The rule that shaped the design, carried over from the original Java/SWT version:

> The UI renders an immutable read-model; the wire format never reaches it.

In this version the rule is enforced by package boundaries and by a process boundary: the wire format is parsed in the backend process, and only the clean read-model is sent to the window.

> This document grows with the migration (umbrella issue #20). Sections marked *coming* describe planned work.

---

## Node and TypeScript in Java terms

| Java world | This project |
|---|---|
| Maven, `pom.xml` | npm, `package.json` |
| Multi-module reactor | npm workspaces: every folder under `theia/` is one package |
| `~/.m2` jars | `node_modules/`, downloaded prebuilt |
| `javac` | `tsc`: TypeScript compiles to JavaScript; `tsc -b` builds the packages in dependency order (`tsconfig.json` `references`) |
| JUnit, AssertJ | mocha, chai |
| Spring, Guice (dependency injection) | inversify, Theia's DI container |
| JVM | Electron, which bundles Node.js (backend) and Chromium (the window) |

---

## How the app runs

An Electron app is three cooperating processes. Our packages each contribute to one or more of them, on top of the shared kernel and the Theia platform.

```mermaid
flowchart LR
    gempba["gempba center<br/><i>TCP, one JSON line per tick</i>"]
    subgraph app["GemPBA Dashboard (Electron app)"]
        direction LR
        subgraph backend["Backend: Node.js"]
            telemetry["@gempba/telemetry<br/>TelemetryServer: TCP client,<br/>wire protocol, mapper, store"]
            authNode["@gempba/auth<br/>SSH session, HOST and JUMP tunnels"]
        end
        subgraph frontend["Frontend: the window"]
            service["@gempba/telemetry<br/>TelemetryService, commands, status bar"]
            authUi["@gempba/auth<br/>MFA, passphrase, host-key prompts"]
            shellUi["@gempba/shell<br/>branding, hidden IDE parts"]
            views["grid, cards, controls<br/><i>coming</i>"]
        end
        subgraph main["Electron main"]
            shellMain["@gempba/shell<br/>window icon"]
        end
    end
    gempba <-->|"TCP: frames in, control lines out"| telemetry
    telemetry -.->|"HOST, JUMP: dials a tunnel's local port"| authNode
    authNode -.->|SSH| gempba
    authNode -.->|"prompts over JSON-RPC"| authUi
    telemetry -->|"WorldSnapshot over JSON-RPC"| service
    service -->|onSnapshot| views
```

- **Electron main** owns native windows. `@gempba/shell` sets the GemPBA icon on them here.
- **Backend** (Node.js) owns the TCP connection and, in HOST and JUMP mode, the SSH session that tunnels it. Each window gets its own `TelemetryServer`, which parses each telemetry line, maps it to a `WorldSnapshot`, and writes refresh-rate control lines back on the same socket.
- **Frontend** (Chromium) draws the UI. `TelemetryService` receives `WorldSnapshot`s from the backend over Theia's built-in JSON-RPC messaging, never raw wire frames, and hands them to the views.

---

## Packages

```mermaid
flowchart TB
    app["@gempba/electron-app<br/>the product"]
    shell["@gempba/shell<br/>Theia extension"]
    telemetry["@gempba/telemetry<br/>the hub"]
    auth["@gempba/auth<br/>a feature"]
    core["@gempba/core<br/>pure kernel"]
    theia["Theia platform<br/>@theia/core, electron, monaco, preferences, messages"]
    app --> shell
    app --> auth
    app --> telemetry
    app --> theia
    auth --> telemetry
    shell --> theia
    telemetry --> core
    telemetry --> theia
```

| Package | What it holds | Java equivalent | Uses Theia? |
|---|---|---|---|
| [`@gempba/core`](theia/gempba-core) | read-model (`WorldSnapshot` → nodes → sockets → workers), `NodeUtilization`, formatters, connection config, `NodeHistoryStore`, `SshEndpoint` | `core` | no: plain TypeScript, shared by backend and frontend |
| [`@gempba/telemetry`](theia/gempba-telemetry) | the hub. Backend: wire protocol, `TelemetryClient` (TCP), `WorldSnapshotMapper`, `TelemetryStore`, `TelemetryServer` (one per window), the `TunnelProvider` contribution point (LOCAL built in), `MockEmitter` (a stand-in gempba center). Frontend: `TelemetryService` and `NodeHistoryService` (the API features inject), the GemPBA commands and status bar entry | `adapters` | yes |
| [`@gempba/shell`](theia/gempba-shell) | branding (About dialog, title-bar logo, window icon, splash) and hiding the IDE parts Theia brings along | — | yes |
| [`@gempba/auth`](theia/gempba-auth) | a feature. Backend: `RemoteConnection` (one authenticated SSH session on `ssh2`, HOST and JUMP forwards), the HOST and JUMP `TunnelProvider`s, `KnownHosts` and `HostKeyVerifier` (trust on first use). Frontend: `AuthPromptImpl` (MFA, passphrase and host-key prompts) | `adapters` (`RemoteConnection`), `ui` (`SwtAuthPrompt`) | yes |
| controls, grid, cards | *coming* (#27–#29): connection bar, dashboard views | `ui` | yes |
| [`@gempba/electron-app`](theia/electron-app) | the product: lists the Theia packages and our extensions; built and packaged | `app` | yes |

### Where the wire format lives

- The gempba wire format (snake_case JSON frames in, control lines out) is described in exactly one file: [`theia/gempba-telemetry/src/node/protocol/wire-protocol.ts`](theia/gempba-telemetry/src/node/protocol/wire-protocol.ts). It lives under `src/node`, which only the backend loads.
- [`WorldSnapshotMapper`](theia/gempba-telemetry/src/node/telemetry/world-snapshot-mapper.ts) is the only place that turns wire types into the camelCase read-model from `@gempba/core`.
- Only `@gempba/core` types cross into the frontend: the JSON-RPC contract in [`telemetry-protocol.ts`](theia/gempba-telemetry/src/common/telemetry-protocol.ts) carries `WorldSnapshot`s, connection states and status text.

---

## Where you can see Theia

1. [`theia/electron-app/package.json`](theia/electron-app/package.json): its dependencies are `@theia/*` packages, it declares `"theia": { "target": "electron" }`, and its scripts call the Theia CLI (`theia build`, `theia start`). The product has no code of its own; Theia generates the startup code from this file.
2. `node_modules/@theia/`: the platform itself, downloaded prebuilt. We never compile it.
3. [`theia/gempba-shell/package.json`](theia/gempba-shell/package.json): the `"theiaExtensions"` entry tells Theia which module to load in the frontend and which in Electron main. This is what makes a package a Theia extension.
4. [`shell-frontend-module.ts`](theia/gempba-shell/src/browser/shell-frontend-module.ts): a `ContainerModule` (think Guice module) that registers *contributions*. Theia collects every extension's contributions at startup.
5. `theia/electron-app/src-gen/` (generated by `theia build`, not committed): the startup code importing each extension's modules.
6. [`telemetry-backend-module.ts`](theia/gempba-telemetry/src/node/telemetry-backend-module.ts) and [`telemetry-frontend-module.ts`](theia/gempba-telemetry/src/browser/telemetry-frontend-module.ts): one service split across two processes. The backend registers `TelemetryServer` per window with `ConnectionContainerModule` and `bindBackendService`; the frontend gets a proxy to it from `ServiceConnectionProvider.createProxy`, and every call or notification travels as a JSON-RPC message.

### How an extension plugs in

```ts
// theia/gempba-shell/src/browser/shell-frontend-module.ts (excerpt)
export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(FilterContribution).to(ShellFilterContribution).inSingletonScope();  // hide Outline and Problems
    bind(MenuContribution).to(ShellMenuContribution).inSingletonScope();      // remove Selection and Go menus
    rebind(AboutDialog).to(GemPbaAboutDialog).inSingletonScope();             // replace Theia's About dialog
});
```

---

## How extensions connect

Every feature is its own Theia extension, and features plug into one hub, `@gempba/telemetry`, never into each other. Adding or removing a feature means touching that package plus one line in [`theia/electron-app/package.json`](theia/electron-app/package.json), the product's list of extensions (like a Maven `<modules>` list).

```mermaid
flowchart TB
    auth["@gempba/auth<br/>adds HOST, JUMP"]
    controls["@gempba/controls<br/><i>coming</i>: connection bar"]
    grid["@gempba/grid<br/><i>coming</i>: per-host rows"]
    cards["@gempba/cards<br/><i>coming</i>: hierarchy tree"]
    telemetry["@gempba/telemetry, the hub<br/>TelemetryService, commands, TunnelProvider"]
    core["@gempba/core<br/>read-model and formatters, no Theia"]
    auth --> telemetry
    controls --> telemetry
    grid --> telemetry
    cards --> telemetry
    telemetry --> core
```

Arrows mean "depends on"; they only point down. Extensions talk through three Theia mechanisms:

| Mechanism | Java analogy | Provided by | Used by |
|---|---|---|---|
| **Service**: an interface plus a DI token, injected with `@inject` | interface + Guice binding | telemetry: `TelemetryService`, `NodeHistoryService` ([`telemetry-service.ts`](theia/gempba-telemetry/src/common/telemetry-service.ts)) | controls, grid, cards |
| **Contribution point**: a socket the host loops over through a `ContributionProvider` | Eclipse extension point, `ServiceLoader` | telemetry defines `TunnelProvider` ([`tunnel-provider.ts`](theia/gempba-telemetry/src/node/tunnel/tunnel-provider.ts)), with LOCAL built in | auth fills it with HOST and JUMP |
| **Theia's shared services**: commands, selection, events | listeners, an event bus | Theia core: `CommandRegistry`, `SelectionService` | grid publishes the selected node; cards react |

A feature's whole coupling to the stream is one injected interface:

```ts
// a view in a feature package (sketch)
@inject(TelemetryService) protected readonly telemetry: TelemetryService;

this.toDispose.push(this.telemetry.onSnapshot(snapshot => this.update(snapshot)));
```

- **Auth opens the road; telemetry drives on it.** In HOST and JUMP mode a `TunnelProvider` opens the SSH tunnel and hands telemetry a local port, which the TCP client reads exactly as in LOCAL mode. Views never learn which mode, tunnel or credentials are in use.
- **Providers live per window.** Tunnel providers are bound in a `ConnectionContainerModule`, next to that window's `TelemetryServer`, so an SSH provider prompts the window that asked: auth reaches the window's `AuthPrompt` through `bindFrontendService`, and the frontend serves it with `ServiceConnectionProvider.createHandler`. That is the reverse direction of `TelemetryService`: the backend calls the frontend and waits for the user's answer.
- **Ready for sessions.** `TelemetryService` is the *active* session's stream. Several sessions switched live can come later as a hub change plus a new feature, with no change to the views.
- **The rules are checked.** [`configs/check-layers.js`](configs/check-layers.js) runs first in `npm test` and fails when a package depends on a `@gempba` package outside its layer: core on nothing, telemetry on core, shell on nothing, a feature on core and telemetry only. Only the app may list features.
- **Every feature must be removable.** Each feature issue checks that the app builds, boots and works with that package dropped from the app. Without controls, the stream still runs from the command palette: F1 → `GemPBA: Connect…`, then `GemPBA: Listen…`. Without auth, Connect offers LOCAL only.

These are Theia *extensions*, composed when the app is built, not VS Code plugins loaded at runtime: the plugin runtime would bring back about 30 IDE packages, and plugin views are limited to webviews.

---

## Key decisions

- **The smallest Theia set that boots.** `@theia/core` alone fails dependency injection: the command palette lives in `@theia/monaco`, the settings providers in `@theia/preferences`. The app uses `core`, `electron`, `monaco`, `preferences` and `messages`. What those drag in that a dashboard doesn't need is hidden by `@gempba/shell` with `FilterContribution` (matched by class, since class names are minified in production builds) and menu unregistration.
- **The read-model is plain data.** It travels over JSON-RPC, where class methods don't survive, so each Java record became a readonly interface plus a same-named namespace for its methods (`WorldSnapshot.forHost(snapshot, host)`). `StructureKey` is a sorted array rather than a `Set`. Stateful helpers that never cross processes (`NodeHistoryStore`, `TelemetryStore`) stay classes.
- **Output matches the Java app.** `NumberText` reproduces Java's `String.format` rounding (`1.005` → `"1.01"`, where JavaScript's `toFixed` gives `"1.00"`) and groups thousands without depending on the OS locale.
- **The kernel never touches the OS.** Anything Java read implicitly (environment variables, the OS user name) is passed in: `Config.from(args, env)`, `SshEndpoint.parse(spec, defaultUser)`.
- **Existing settings keep working.** Enums are string enums (`'JUMP'`) like the existing `settings.json`, and `of()` factories fill in fields that older files lack.
- **Parsing follows the Java contract.** Unknown wire fields are ignored, missing numbers read as 0, and missing objects or lists stay `undefined`. A topology node without `sockets` falls back to the live frame's socket count, while `sockets: []` means zero sockets.
- **Utilization is per allocation**: a node's CPU is `clamp(Σ worker CPU ÷ |allocated cores|, 0, 100)`, the user's own work on the user's own cores, excluding other tenants on a shared node.
- **One telemetry session per window.** `TelemetryServer` lives in Theia's per-connection container, so each window has its own and closing the window closes its connection. That container binds a `ContributionProvider` of its own, which hides the application's, so the `TunnelProvider` contribution provider and all tunnel providers are bound inside connection modules.
- **SSH follows the Java client and OpenSSH.** One session is authenticated once (the explicit key, then the default `~/.ssh` identities, then up to three keyboard-interactive rounds for MFA) and every target is a cheap forward over it. JUMP runs `ssh -N -L` on the login node over a PTY exec channel, so the hop uses the cluster's own node-to-node trust and closing the channel hangs it up. Host keys are checked against the user's own `~/.ssh/known_hosts`: a known key passes, a changed key is refused without asking, and a new host is confirmed once and remembered.
- **`ssh2` stays pure JavaScript.** Its optional native install scripts (`ssh2`, `cpu-features`) are denied in `allowScripts`, so there is no extra native module to build per OS or package.
- **Connections drop stale work by epoch.** Every stop, disconnect or new target bumps an epoch; callbacks and late tunnel opens from an older epoch are discarded, as in the Java `ConnectionController`. The refresh intervals are sticky and re-sent on every (re)connect.
- **Dead Java code was not ported**: `ConnectionSpec`, and `SshCommand`, which only served the never-used child-process tunnel. Both remain in git history.

---

## Build, run and test

```
npm ci                    # install (Node 22)
npm run build             # tsc -b, then theia build
npm run rebuild:electron  # once after installing: native modules for Electron
npm start                 # launch the app
npm test                  # check the layering, compile, then run every package's specs
npm run mock              # after a build: a stand-in gempba center on 127.0.0.1:9000
```

To see live data without a cluster: run `npm run mock`, start the app, then press F1 and run `GemPBA: Connect…` (pick Local) and `GemPBA: Listen…` (port 9000). The status bar shows the node count. For HOST and JUMP, the Python [gempba-dashboard-mocker](https://github.com/apdistributedsystems/gempba-dashboard-mocker) impersonates a VM or a login node with MFA.

- Specs live next to their sources (`*.spec.ts`) and run from the compiled `lib/`. The root [`.mocharc.js`](.mocharc.js) lets an IDE run or debug a single spec file: it builds the package and runs the compiled copy, so breakpoints map back to the TypeScript through source maps.
- Native modules exist in two builds: `npm rebuild` targets Node.js (tests), `npm run rebuild:electron` targets Electron (the app).
- npm only runs the install scripts listed under `allowScripts` in the root `package.json`.
- CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) installs, compiles, tests and builds on Linux, Windows and macOS. Installers and releases come with #30.
