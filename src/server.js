const express = require('express');
const app = express();
const http = require('http').Server(app);
const _ = require('lodash');
const fs = require('fs');
const proc = require('child_process');

const { config, backgrounds } = require('./config');
const { fetch } = require('./animeutils');

app.use(express.static(__dirname + '/server'));
app.use('/bg', express.static(__dirname + '/../custom_backgrounds'));

if (
  config &&
  fs.existsSync(config.settings.output_dir + '/custom_backgrounds')
) {
  console.log('using', config.settings.output_dir + '/custom_backgrounds');
  app.use(
    '/bg',
    express.static(config.settings.output_dir + '/custom_backgrounds')
  );
}

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/server/index.html');
});

app.get('/api/airing', async (req, res) => {
  res.json(await fetch.airing());
});

app.get('/api/backgrounds', async (req, res) => {
  res.json(backgrounds());
});

app.get('/api/todo', async (req, res) => {
  if (!config)
    return res
      .status(422)
      .json({
        message: 'Config.yml Needed. Restart app when config is updated.',
      });

  res.json(await fetch.todo());
});

app.get('/api/ptw', async (req, res) => {
  if (!config)
    return res
      .status(422)
      .json({
        message: 'Config.yml Needed. Restart app when config is updated.',
      });

  res.json(await fetch.todo({ ptw: true }));
});

function startServer() {
  const port = (config && config.settings.server_port) || 3000;
  console.log('Starting server on port', port);
  http.listen(port);
}

function startApp() {
  const sp = proc.spawn(require('electron'), [__dirname + '/window.js']);
  sp.on('error', err => {
    console.log('failed to start process', err);
  });
  sp.on('exit', (code, signal) => {
    process.exit(code);
  });
}

module.exports = {
  startServer,
  startApp,
};
