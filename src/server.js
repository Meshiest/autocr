const express = require('express');
const app = express();
const http = require('http').Server(app);
const _ = require('lodash');

const { config } = require('config');
const { fetch } = require('./src/animeutils.js');

app.use(express.static('server'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + 'server/index.html');
});

app.get('/airing', async (req, res) => {
  const malPromise = config && fetch.mal(config.settings.myanimelist.username);
  const airing = await fetch.anichart('http://anichart.net/api/airing');
  const mal = malPromise ? await malPromise : [];

  _.each(mal, shows => {
    shows.map(show => {
      const malId = show.mal_link.match(/\d+$/);
      const crLink = _.find(show.external_links, {site: 'Crunchyroll'});

      if(malId && _.find(mal, {anime_id: parseInt(malId[0])}))
        show.onMyMal = true;

      if(config && config.shows && crLink && _.find(config.shows, s => s.crunchyroll.match(crLink.url)))
        show.onMyConfig = true;
    });
  });

  res.json(shows);
});

app.get('/todo', async (req, res) => {
  if(!config)
    return res.status(422).json({message: 'Config.yml Needed. Restart app when config is updated.'});

  res.json(await fetch.todo());
});

function start(port) {
  http.listen(port || config && config.settings.server_port || 3000);
}

module.exports {
  start,
};