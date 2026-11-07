# v2.0.0

<small>2026-11-07 · [tag](https://github.com/rapastranac/gempba-dashboard/releases/tag/v2.0.0)</small>

The GemPBA Dashboard, rebuilt as an Eclipse Theia desktop app: the whole run at a glance, every rank in detail, real installers for Windows, macOS and Linux, and updates from inside the app.

## Before you upgrade

- **Needs gempba v4.3.0 or later.** Dashboard 2.0 reads telemetry schema 2, which gempba v4.3.0 sends. For gempba v4.2.x and earlier, keep dashboard 1.x.
- **Coming from 1.x:** download the installer below by hand; 1.x has no updater. Your saved connections in `~/.gempba-dashboard/settings.json` carry over. From 2.0 on, the app offers new versions itself.

## Download

> 🔒 **Built in the open.** Every installer here is built by GitHub Actions straight from the tagged source in this repo, never by hand. The code is public and so are the build logs, so there's no middleman between what you read and what you run.

| Platform | Asset | Install |
|---|---|---|
| Windows (x64) | `gempba-dashboard-2.0.0-win-x64.exe` | Run the installer; it installs for your user only, and you can pick the folder. |
| macOS (Apple Silicon) | `gempba-dashboard-2.0.0-mac-arm64.dmg` | Open the dmg and drag the app to Applications. A `.zip` of the app is there too. |
| macOS (Intel) | `gempba-dashboard-2.0.0-mac-x64.dmg` | Same as above. |
| Linux (x64) | `gempba-dashboard-2.0.0-linux-x86_64.AppImage` | `chmod +x` it and run it; it needs FUSE 2 (`sudo apt install libfuse2t64` on Ubuntu 24.04). |
| Debian, Ubuntu (x64) | `gempba-dashboard-2.0.0-linux-amd64.deb` | `sudo apt install ./gempba-dashboard-2.0.0-linux-amd64.deb` |

> **First launch:** the builds aren't code-signed yet. On Windows, click **More info** → **Run anyway** on the SmartScreen prompt. On macOS, go to **System Settings** → **Privacy & Security** and click **Open Anyway** for GemPBA Dashboard.

## Highlights

### The whole run at a glance
- The **Grid** sums the run up on top: the cores busy, the tasks started each second with their history, the tasks moved between ranks and across nodes, how idle the working ranks are, the memory, and how the run is set up (scheduler, load balancer, ranks, threads, gempba version).
- Below it, one tile per node shows its CPU and history, its tasks, its memory, and the tasks it sent and received. A node whose ranks stop sending fades on its own.

### Every node, socket and rank
- **Cards** lists the run as a tree, and shows the picked row as a live panel: a rank's CPU on the cores it may use, its tasks, its idle time and where it goes, its memory, its thread pool, its busiest peers, and its totals since the run started. The coordinator, the aggregator and each node's sentinel are named as such.
- **Charts you choose:** CPU, memory, idle time, tasks started, run locally, sent and received, and bytes sent and received, each as a rate or a running total. Add, swap, move or remove them; every rank shares one layout and every node another, kept across restarts.

### Data that stops still makes sense
- When a run pauses, ends or the connection drops, the views keep what they last showed, dimmed a little, under a bar that says why and since when: `Paused`, `Run ended`, `Reconnecting…` or `Not live`. Nothing clears until you press **Clear** or listen again.

### The run, in your hands
- Pause and resume gempba's telemetry, take a snapshot while it is paused, mark a moment of the run with a label, and set how often frames arrive.

### Connect to a run anywhere
- **Local**, **Host** (one SSH hop to a VM) and **Jump host** (through a login node to a compute node), as in 1.x. SSH now uses your keys and `known_hosts` in `~/.ssh`, asks to trust a new host once, and prompts for passphrases and MFA codes.

### Updates from inside the app
- **Help › Check for Updates…**, and a quiet check at startup, tell you when a newer version is out. The Windows installer and the AppImage download and install it when you choose **Update**, then **Restart Now**; the `.deb` and macOS builds link to the release page instead.

### Also new
- A macOS build for Intel Macs, besides Apple Silicon.
- GemPBA Light and Dark themes, every command in the palette (F1 → `GemPBA: …`), and a status bar that sums the stream up, such as `4 nodes · 26.6k tasks/s · 500 ms`.

## Known limitations
- The builds are unsigned, so Windows and macOS warn on first launch (see above).
- On macOS, updates link to the release page rather than install in place, until the app is signed and notarized. A `.deb` is updated by its package manager, so it gets the same link.

See the [README](https://github.com/rapastranac/gempba-dashboard#readme) for connecting to a run and using the views.
