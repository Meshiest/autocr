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
    webPreferences: {
      experimentalFeatures: true,
    },
  });
  console.log('connected to', port);
  mainWindow.loadURL('http://localhost:' + port);
  mainWindow.focus();
});