const { app, BrowserWindow } = require('electron');

app.on('ready', () => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    autoHideMenuBar: true,
    useContentSize: true,
    resizable: true,
    icon: __dirname + '/server/logo.png',
  });
  mainWindow.loadURL(__dirname + '/server/index.html');
  mainWindow.focus();
});