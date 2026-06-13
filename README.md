# gempba-dashboard

A desktop telemetry dashboard for the [GemPBA](https://github.com/rapastranac/gempba) parallel branch-and-bound framework — live nodes, sockets, workers, and how hard your allocation is actually working.

## Download and run

Grab the zip for your platform from the [latest release](https://github.com/apdistributedsystems/gempba-dashboard/releases/latest), unzip it, and launch — a Java runtime is bundled, so nothing else needs installing.

| Platform | Asset | Launch |
|----------|-------|--------|
| Windows (x64) | `…-windows-x64.zip` | `gempba-dashboard/gempba-dashboard.exe` |
| macOS (Apple Silicon) | `…-macos-aarch64.zip` | `gempba-dashboard.app` |
| Linux (x64) | `…-linux-x64.zip` | `gempba-dashboard/bin/gempba-dashboard` |

### First launch

The builds are not yet code-signed, so the OS will warn the first time:

- **macOS** — right-click the app → **Open** → **Open** (one-time), or clear the quarantine flag: `xattr -dr com.apple.quarantine "gempba-dashboard.app"`.
- **Windows** — on the SmartScreen prompt, click **More info** → **Run anyway**.
- **Linux** — no prompt; just run the launcher (make it executable if your unzip tool dropped the bit: `chmod +x "gempba-dashboard/bin/gempba-dashboard"`).

### Requirements

- A reachable GemPBA center to connect to (direct TCP, or tunnelled over SSH).
- For the SSH-tunnel option, an `ssh` client on `PATH` — built in on macOS, Linux, and Windows 10+.

## Build from source

Requires JDK 25 and Maven.

```sh
mvn -B install            # build all four modules and run the tests
mvn -B -pl app exec:java  # launch the dashboard
```

The build is a multi-module reactor (`core`, `adapters`, `ui`, `app`); see [ARCHITECTURE.md](ARCHITECTURE.md) for the layering and the dependency rule it enforces.
