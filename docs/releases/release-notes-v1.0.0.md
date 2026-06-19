# v1.0.0

<small>2026-06-18</small>

The first release of the **GemPBA Dashboard**: a self-contained desktop app for watching a GemPBA run live, on your machine or over SSH, with nothing to install beyond unzipping it.

## Download

> 🔒 **Built in the open.** Every app-image here is built by GitHub Actions straight from the tagged source in this repo, never by hand. The code is public and so are the build logs, so there's no middleman between what you read and what you run.

Download the app-image for your platform from the assets below, unzip, and launch. A Java runtime is bundled, so there's nothing else to install.

| Platform | Asset |
|---|---|
| Windows | `gempba-dashboard-1.0.0-windows-x64.zip` |
| Linux | `gempba-dashboard-1.0.0-linux-x64.zip` |
| macOS (Apple Silicon) | `gempba-dashboard-1.0.0-macos-aarch64.zip` |

> **macOS:** this build isn't signed or notarized yet, so Gatekeeper warns on first launch. Right-click the app and choose **Open** to run it.

## Highlights

### Live telemetry
- A **grid** of per-node tiles with live CPU history graphs and memory bars.
- A **cards** view of the full World → Node → Socket → Worker hierarchy, plus a click-through **detail window** per node.
- **Per-job memory:** each tile shows your job's real usage against its allocation (cgroup-aware), not the host total.
- A copyable status line and adjustable worker and node refresh rates.

### Connect to a run anywhere, no external tunnels
- Three connection modes: **Local** (this machine), **Host** (one SSH hop to a VM), and **Jump** (through an MFA login node to an HPC compute node).
- **In-app MFA:** the embedded SSH client answers a Duo or keyboard-interactive challenge in a dialog, so there's no separate ssh tunnel to set up.
- **Authenticate once, observe many:** the session stays warm, so re-pointing to a different job (node or port) needs no re-prompt. A single **Listen/Stop** toggle reverts on its own when the run ends.
- Nothing connects unprompted on launch. Recent targets and login hosts are remembered, and settings persist to `~/.gempba-dashboard/settings.json`.

### Cross-platform and self-contained
- Native app-images for Windows, Linux, and macOS, each bundling its own JRE. Download, unzip, run. No JDK required.

## Known limitations
- macOS builds are unsigned and unnotarized (see the note above), and only the Apple Silicon build is produced.

See the [README](../../README.md) for download and first-launch details.
