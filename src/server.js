const express = require('express');
const app = express();
const http = require('http').Server(app);
const _ = require('lodash');

const proc = require('child_process');

const { config } = require('./config.js');
const { fetch } = require('./animeutils.js');

app.use(express.static(__dirname + '/server'));
app.use(express.static(__dirname + '/../node_modules/vue/dist'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/server/index.html');
});

app.get('/api/airing', async (req, res) => {
  const malPromise = config && fetch.mal(config.settings.myanimelist.username);
  const airing = await fetch.anichart('http://anichart.net/api/airing');
  const mal = malPromise ? await malPromise : [];

  _.each(airing, shows => {
    shows.map(show => {
      const malId = show.mal_link.match(/\d+$/);
      const crLink = _.find(show.external_links, {site: 'Crunchyroll'});

      show.onMyMal = malId && _.find(mal, {anime_id: parseInt(malId[0])});
      show.onMyConfig = config && config.shows && crLink && _.find(config.shows, s => s.crunchyroll.match(crLink.url));
    });
  });

  res.json(airing);
});

app.get('/api/todo', async (req, res) => {
  if(!config)
    return res.status(422).json({message: 'Config.yml Needed. Restart app when config is updated.'});

  res.json(await fetch.todo());
});

function startServer() {
  const port = config && config.settings.server_port || 3000;
  console.log('Starting server on port', port);
  http.listen(port);
}

function startApp() {
  const sp = proc.spawn(require('electron'), [__dirname + '/window.js']);
  sp.on('error', (err) => {
    console.log('failed to start process', err);
  });
  sp.on('exit',(code, signal) => {
    process.exit(code);
  });
}


module.exports = {
  startServer,
  startApp,
};