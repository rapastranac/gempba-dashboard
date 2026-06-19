# GemPBA Dashboard

[![CI](https://github.com/rapastranac/gempba-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/rapastranac/gempba-dashboard/actions/workflows/ci.yml)
![GitHub Release](https://img.shields.io/github/v/release/rapastranac/gempba-dashboard)
![GitHub License](https://img.shields.io/github/license/rapastranac/gempba-dashboard)
![Java](https://img.shields.io/badge/Java-25-orange)
![Built with Maven](https://img.shields.io/badge/build-Maven-C71A36)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/rapastranac/gempba-dashboard)

A desktop telemetry dashboard for the [GemPBA](https://github.com/rapastranac/gempba) parallel branch-and-bound framework: live nodes, sockets, workers, and how hard your allocation is actually working.

---

## Download and run

Grab the zip for your platform from the [latest release](https://github.com/rapastranac/gempba-dashboard/releases/latest), unzip it, and launch. A Java runtime is bundled, so nothing else needs installing.

| Platform | Asset | Launch |
|----------|-------|--------|
| Windows (x64) | `…-windows-x64.zip` | `gempba-dashboard/gempba-dashboard.exe` |
| macOS (Apple Silicon) | `…-macos-aarch64.zip` | `gempba-dashboard.app` |
| Linux (x64) | `…-linux-x64.zip` | `gempba-dashboard/bin/gempba-dashboard` |

### First launch

The builds are not yet code-signed, so the OS will warn the first time:

- **macOS:** right-click the app → **Open** → **Open** (one-time), or clear the quarantine flag: `xattr -dr com.apple.quarantine "gempba-dashboard.app"`.
- **Windows:** on the SmartScreen prompt, click **More info** → **Run anyway**.
- **Linux:** no prompt; just run the launcher (make it executable if your unzip tool dropped the bit: `chmod +x "gempba-dashboard/bin/gempba-dashboard"`).

### Requirements

- A reachable GemPBA center to connect to (direct TCP, or tunnelled over SSH).
- For the SSH-tunnel option, an `ssh` client on `PATH`, built in on macOS, Linux, and Windows 10+.

## Build from source

Requires JDK 25 and Maven.

```sh
mvn -B install            # build all four modules and run the tests
mvn -B -pl app exec:java  # launch the dashboard
```

The build is a multi-module reactor (`core`, `adapters`, `ui`, `app`); see [ARCHITECTURE.md](ARCHITECTURE.md) for the layering and the dependency rule it enforces.

## License

MIT. See [LICENSE](LICENSE).
