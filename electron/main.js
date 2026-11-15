/* Momentum — real macOS/Windows desktop app shell.
   Loads the live planner so the app content updates itself automatically,
   exactly like a normal desktop application that updates in the background. */
const { app, BrowserWindow, shell, dialog } = require('electron');

const LIVE = 'https://quantum-shadow911.github.io/Planner/';

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 880,
    minHeight: 600,
    title: 'Momentum',
    backgroundColor: '#f4f5fa',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => win.show());

  win.loadURL(LIVE).catch(() => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Momentum needs internet',
      message: 'Momentum could not reach the internet.',
      detail: 'Connect to Wi-Fi and click Retry. Your data is safe and saved in the app.',
      buttons: ['Retry', 'Quit']
    }).then(({ response }) => {
      if (response === 0) win.loadURL(LIVE).catch(() => {});
      else app.quit();
    });
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
