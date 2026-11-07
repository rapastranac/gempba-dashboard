// Renders branding/favicon.svg to theia/electron-app/resources/icon.png at 1024 px on a transparent background:
// the window icon, and the image electron-builder turns into the Windows .ico, the macOS .icns and the Linux icons.
// Run from the repository root after changing the logo: npx electron branding/render-icon.js
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const SIZE = 1024;
const SOURCE = path.join(__dirname, 'favicon.svg');
const TARGET = path.join(__dirname, '..', 'theia', 'electron-app', 'resources', 'icon.png');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
    const svg = Buffer.from(fs.readFileSync(SOURCE)).toString('base64');
    const page = `<body style="margin:0;background:transparent"><img width="${SIZE}" height="${SIZE}" src="data:image/svg+xml;base64,${svg}"></body>`;
    const window = new BrowserWindow({ width: SIZE, height: SIZE, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
    await window.loadURL(`data:text/html;base64,${Buffer.from(page).toString('base64')}`);
    await new Promise(resolve => setTimeout(resolve, 500));
    const image = await window.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
    fs.writeFileSync(TARGET, image.resize({ width: SIZE, height: SIZE }).toPNG());
    console.log(`wrote ${TARGET} (${SIZE}x${SIZE})`);
    app.quit();
});
