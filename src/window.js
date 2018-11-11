const { app, BrowserWindow } = require('electron');

const { config } = require('./config.js');

app.on('ready', () => {
  const port = config && config.settings.server_port || 3000;
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    autoHideMenuBar: true,
    useContentSize: true,
    resizable: true,
  });
  mainWindow.loadURL('http://localhost:' + port);
  mainWindow.focus();
});