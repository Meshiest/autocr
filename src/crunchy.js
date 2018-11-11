const fs = require('fs');
const { fetch, CR_URL_REGEX } = require('./animeutils.js');
const { batch: crunchy } = require('../node_modules/crunchy/dist');
const { config } = require('./config.js');
const { mkdir } = require('./utils.js');
const _ = require('lodash');


const TEMP_BATCH_PATH = (config ? fs.realpathSync(config.settings.output_dir) + '/' : '') + '.crunchybatch.txt';

// Run the crunchy tool with credentials and config
// If the args prop is given, do not run batch operations
function runCrunchy(...args) {
  crunchy(process.argv = [
      '--user', config.settings.crunchyroll.username,
      '--pass', config.settings.crunchyroll.password,
      '--nametmpl', '{SERIES_TITLE} - s{SEASON_NUMBER}e{EPISODE_NUMBER}',
      '--output',  fs.realpathSync(config.settings.output_dir),
      '--ignoredub',
      ...(args.length ? args : ['--batch', TEMP_BATCH_PATH])
    ], err => {
      if(err)
        console.error(err);

      fs.existsSync(TEMP_BATCH_PATH) && fs.unlink(TEMP_BATCH_PATH, err => {
        err && console.error('Error removing temp file:', err);
      });
    });
}

// Check what shows we need to download, crunchy handles not downloading the same thing twice by accident
async function watchFeed() {
  const listPromise = fetch.mal(config.settings.myanimelist.username);
  const items = (await fetch.feed()).rss.channel[0].item;
  const list = await listPromise;

  // Select only items that are in our config "shows" list
  const toDownload = items.filter(i => i['crunchyroll:episodeNumber']).map(i => ({
    date: i.pubDate[0],
    episode: +i['crunchyroll:episodeNumber'][0],
    link: i.link,
    ... (_.find(config.shows || [], {crunchyroll: i.link[0].match(CR_URL_REGEX)[0]}) || {})
  }))
  .filter(i => i.title)
  .filter(i => {
    const malEntry = _.find(list, {anime_id: i.id}, {});
    return malEntry && malEntry.num_watched_episodes < i.episode - i.offset;
  });

  // Create the data dir if it doesn't already exist
  mkdir(config.settings.output_dir);
  
  // Build and write a batch file for crunchy
  const shows = toDownload.map(({link}) => '@' + link).join('\n');
  fs.writeFileSync(TEMP_BATCH_PATH, shows);

  runCrunchy();
}

module.exports = {
  runCrunchy,
  watchFeed,
  TEMP_BATCH_PATH,
};
