const { app, BrowserWindow } = require('electron');
const windowStateKeeper = require('electron-window-state');

app.on('ready', () => {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 800,
    defaultHeight: 600,
  });

  const mainWindow = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minHeight: 300,
    minWidth: 300,
    autoHideMenuBar: true,
    resizable: true,
    icon: __dirname + '/server/logo.png',
  });

  mainWindowState.manage(mainWindow);

  mainWindow.loadURL(__dirname + '/server/index.html');
  mainWindow.focus();
});
