# v2.1.0

<small>2026-11-14 · [tag](https://github.com/rapastranac/gempba-dashboard/releases/tag/v2.1.0)</small>

The dashboard for gempba v5.0.0: it says how a run ended, and stops a run gracefully with its stop token.

## Before you upgrade

- **Works with gempba v4.3.0 and later**, on telemetry schema 2 as before. Saying how a run ended and stopping it need gempba v5.0.0; a gempba 4.x run still reads `Run ended`.
- **Coming from 2.0:** the app offers 2.1.0 itself (**Help › Check for Updates…**). The Windows installer and the AppImage install it when you choose **Update**; the `.deb` and macOS builds link to this page.

## Download

> 🔒 **Built in the open.** Every installer here is built by GitHub Actions straight from the tagged source in this repo, never by hand. The code is public and so are the build logs, so there's no middleman between what you read and what you run.

| Platform | Asset | Install |
|---|---|---|
| Windows (x64) | `gempba-dashboard-2.1.0-win-x64.exe` | Run the installer; it installs for your user only, and you can pick the folder. |
| macOS (Apple Silicon) | `gempba-dashboard-2.1.0-mac-arm64.dmg` | Open the dmg and drag the app to Applications. A `.zip` of the app is there too. |
| macOS (Intel) | `gempba-dashboard-2.1.0-mac-x64.dmg` | Same as above. |
| Linux (x64) | `gempba-dashboard-2.1.0-linux-x86_64.AppImage` | `chmod +x` it and run it; it needs FUSE 2 (`sudo apt install libfuse2t64` on Ubuntu 24.04). |
| Debian, Ubuntu (x64) | `gempba-dashboard-2.1.0-linux-amd64.deb` | `sudo apt install ./gempba-dashboard-2.1.0-linux-amd64.deb` |

> **First launch:** the builds aren't code-signed yet. On Windows, click **More info** → **Run anyway** on the SmartScreen prompt. On macOS, go to **System Settings** → **Privacy & Security** and click **Open Anyway** for GemPBA Dashboard.

## Highlights

### How the run ended
- With gempba v5.0.0, the bar over the Grid and Cards and the status bar say how the run ended, and keep saying it once the stream stops: `Run completed` with its result proven, or interrupted by a signal such as `SIGTERM`, from a dashboard or by its program, with its best result so far.
- A stream that closes without the run's final line says the run was killed or the connection dropped, since the two can't be told apart.

### Stop the run
- **Stop the run**, in the Connection view's Run section, the live controls menu and the palette (`GemPBA: Stop the Run…`), stops a gempba v5.0.0 run gracefully, keeping its best result so far.
- It asks for the stop token the run was started with, its `GEMPBA_STOP_TOKEN`. With another token, or none, the run keeps going. The token is kept nowhere and never shown.

### Also new
- In the Connection view, the button that ends the stream now reads **Stop listening**.

## Known limitations
- The builds are unsigned, so Windows and macOS warn on first launch (see above).
- On macOS, updates link to the release page rather than install in place, until the app is signed and notarized. A `.deb` is updated by its package manager, so it gets the same link.

See the [README](https://github.com/rapastranac/gempba-dashboard#readme) for connecting to a run and using the views.
