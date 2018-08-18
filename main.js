const fs = require('fs');
const _ = require('lodash');
const sqlite3 = require('sqlite3').verbose();
const yaml = require('js-yaml');
const { batch: crunchy } = require('./node_modules/crunchy/dist');
const format = require('string-format');
const request = require('request');
const commander = require('commander');
const cheerio = require('cheerio');
const { parseString: parseXML } = require('xml2js');
const chokidar = require('chokidar');

const CR_URL_REGEX = /https?:\/\/www.crunchyroll\.com\/(.+?)\//;

// Create a directory if it does not already exist
function mkdir(dir) {
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
  }
}

// Write an object to the yml config file
function writeConfig(obj) {
  fs.writeFileSync('config.yml', yaml.safeDump(obj));
}

// A map function that allows map to have asynchronous functions
Array.prototype.syncMap = async function (fn) {
  let arr = [];
  for(let i = 0; i < this.length; i++) {
    try {
      arr.push(await fn(this[i]));
    } catch (e) {
      arr.push(undefined);
    }
  }
  return arr;
};

// Create the default config file
if(!fs.existsSync('config.yml')) {
  console.log('Remember to update the default values in your newly created config.yml!');
  writeConfig({
    agree_to_license: false,
    settings: {
      myanimelist: {
        username: 'MAL_USERNAME',
      },
      crunchyroll: {
        username: 'CRUNCHYROLL_USERNAME',
        password: 'CRUNCHYROLL_PASSWORD',
      },
      feed_interval_mins: 60,
      output_dir: 'downloads',
    },
    shows: null,
  });
}

// Load config file
let config = yaml.safeLoad(fs.readFileSync('config.yml', 'utf8'));
const TEMP_BATCH_PATH = fs.realpathSync(config.settings.output_dir) + '/.crunchybatch.txt';

// Grabs a user's list in JSON form
function fetchList(name) {
  return new Promise((resolve, reject) => {
    request(`https://myanimelist.net/animelist/${name}?status=1`, (err, resp, body) => {
      if(err)
        return reject(err);
      const $ = cheerio.load(body);
      resolve(JSON.parse($('.list-block table').attr('data-items')));
    });
  });
}

// Get the XML as an object from the Crunchyroll new anime feed
function fetchFeed() {
  return new Promise((resolve, reject) => {
    request('http://www.crunchyroll.com/rss/anime', (err, resp, body) => {
      if(err)
        return reject(err);
      parseXML(body, (err, res) => {
        if(err)
          return reject(err);
        resolve(res);
      });
    });
  });
}

// Run the crunchy tool with credentials and config
function runCrunchy() {
  crunchy(process.argv = [
      '--user', config.settings.crunchyroll.username,
      '--pass', config.settings.crunchyroll.password,
      '--nametmpl', '{SERIES_TITLE} - s{SEASON_NUMBER}e{EPISODE_NUMBER}',
      '--output',  fs.realpathSync(config.settings.output_dir),
      '--batch', TEMP_BATCH_PATH,
      '--ignoredub',
    ], err => {

      if(err)
        console.error(err);

      // fs.existsSync(TEMP_BATCH_PATH) && fs.unlink(TEMP_BATCH_PATH, err => {
      //   err && console.error('Error removing temp file:', err);
      // });
    });
}

// Try to get the Crunchyroll link by searching for videos based on the MAL show name
function guessCrunchyroll(mal_item) {
  return new Promise((resolve, reject) => {
    const {anime_url, anime_title} = mal_item;

    // Search crunchyroll and resolve if we found a video
    function tryTitle(title) {
      return new Promise((resolve, reject) => {
        request(`http://www.crunchyroll.com/search?from=search&q=${title.replace(/ /g, '+')}`, (err, resp, body) => {
          if(err)
            return reject(err);

          const $ = cheerio.load(body);
          const elem = $('#aux_results li a');
          const url = elem[0] && elem[0].attribs.href;
          const linkMatch = url && url.match(CR_URL_REGEX);
          if(url && linkMatch) {
            resolve(linkMatch[0]);
          } else {
            reject('No videos...');
          }
        });
      });
    }

    // Open the MAL show page and find the "English" or "Synonyms" section on the side bar
    request(`https://myanimelist.net${anime_url}`, async (err, resp, body) => {
      if(err) {
        return tryTitle(anime_title).then(resolve, reject);
      }

      try {
        // Show was found based on the title, easy for shows with English titles!
        return resolve(await tryTitle(anime_title));
      } catch (e) {
        // nothing to do..
      }

      const $ = cheerio.load(body);

      // Find the title translations in the side bar
      const elem = $('h2 + div.spaceit_pad > span.dark_text');
      if(elem[0]) {
        switch(elem[0].children[0].data) {

        //  We have a few possible show names, let's go down the list in order
        case 'Synonyms:':
          const titles = elem[0].next.data.split(',').map(t => t.trim());
          for(let i = 0; i < titles.length; i++) {
            try {
              return resolve(await tryTitle(titles[i]));
            } catch (e) {
              continue;
            }
          }
          // Could not find based on synonyms
          resolve(null);
          break;

        // We only have one show name and it's probably the right one
        case 'English:':
          try {
            return resolve(await tryTitle(elem[0].next.data.trim()));
          } catch (e) {
            // Could not find based on english title
            return resolve(null);
          }
          break;
        }
      }

      // This means there were no synonyms, english title, the title is in japanese
      // OR crunchyroll does not have the show
      resolve(null);
    });
  });
}

if(!config.agree_to_license) {
  console.error('Before using this software you must read and agree to the LICENSE and set the agree_to_license property to true in the config.yml file');
  process.exit(0);
}

const program = require('commander')
  .version(require('./package').version);

// Enable/disable console.log/process.stdout.write
const log = console.log.bind(console);
const writeBackup = process.stdout.write.bind(process.stdout);
function setQuiet(enabled) {
  const none = () => {};
  console.log = enabled ? none : log;
  console.log = enabled ? none : log;
  process.stdout.write = enabled ? none : writeBackup;
}

program
  .command('pull')
  .description('Pull currently watching shows from MyAnimeList and populate config file')
  .action(async () => {
    console.log('Fetching MAL...');
    // Get currently watching shows from MyAnimeList
    const list = await fetchList(config.settings.myanimelist.username);

    // Find the crunchyroll link for each of the shows
    const shows = await Promise.all(list.map(async show => ({
      title: show.anime_title,
      crunchyroll: await guessCrunchyroll(show),
      id: show.anime_id,
      offset: 0,
    })));

    const beforeLen = (config.shows || []).length;

    // Only add shows that are not already in the list
    const newShows = (config.shows || []).concat(shows.filter(s => !_.find(config.shows, {id: s.id})));

    // Update the config with the found shows
    writeConfig(Object.assign(config, {
      shows: newShows,
    }));

    console.log('Config Updated!', newShows.length - beforeLen, 'shows added');
  });

program
  .command('cull')
  .description('Cull shows that are not currently watched from the config file')
  .action(async () => {
    console.log('Fetching MAL...');
    // Get currently watching shows from MyAnimeList
    const list = await fetchList(config.settings.myanimelist.username);
    
    const beforeLen = (config.shows || []).length;

    // Only remove shows that are not in the currently watching list
    const newShows = _.filter(config.shows, s => _.find(list, {anime_id: s.id}));

    // Remove shows not in the currently watching list from the config
    writeConfig(Object.assign(config, {
      shows: newShows,
    }));

    console.log('Config Updated!', beforeLen - newShows.length, 'shows removed');
  });

program
  .command('get')
  .description('Download latest episodes all at once')
  .action(async () => {
    console.log('Fetching MAL...');
    const list = await fetchList(config.settings.myanimelist.username);

    // Create the data dir if it doesn't already exist
    mkdir(config.settings.output_dir);
    
    // Build and write a batch file for crunchy
    const shows = _.sortBy( // download higher scored shows first :)
      config.shows.map(s =>
        _.merge(s,
          _.pick(_.find(list, {anime_id: s.id}, {}), // get number of watched episodes
            ['num_watched_episodes', 'score']
          )
        )
      ),
      ['score']
    ).reverse()
    .map(({crunchyroll: url, offset: o, num_watched_episodes: e}) => 
      `${url} -e ${o + e + 1}-`
    ).join('\n');
    fs.writeFileSync(TEMP_BATCH_PATH, shows);

    runCrunchy();
  });

// Check what shows we need to download, crunchy handles not downloading the same thing twice by accident
async function watchFeed() {
  const listPromise = fetchList(config.settings.myanimelist.username);
  const items = (await fetchFeed()).rss.channel[0].item;
  const list = await listPromise;
  
  // Select only items that are in our config "shows" list
  const toDownload = items.filter(i => i['crunchyroll:episodeNumber']).map(i => ({
    date: i.pubDate[0],
    episode: +i['crunchyroll:episodeNumber'][0],
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
  const shows = toDownload.map(({crunchyroll: url, offset: o, episode: e}) => 
    `${url} -e ${e}-`
  ).join('\n');
  fs.writeFileSync(TEMP_BATCH_PATH, shows);

  runCrunchy();
}

program
  .command('watch')
  .description('Download latest episodes as they come out on CrunchyRoll')
  .action(() => {
    const watcher = chokidar.watch('file', {
      persistent: true,
      ignoreInitial: true
    });

    watcher
      .on('add', path =>  {
        path.match(/\.mp4$/) && log('Starting', path.match(/([^\/\\]+)\.mp4$/)[1]);
        path.match(/\.mkv$/) && log('Finished', path.match(/([^\/\\]+)\.mkv$/)[1]);
      });
      
    watcher.add(config.settings.output_dir + '/**');
    
    console.log('Starting CR Feed Watching...');

    setQuiet(true);
    watchFeed();
    setInterval(watchFeed, Math.max(config.settings.feed_interval_mins, 15) * 60000);
  });

// Parse command line args and run commands!
program.parse(process.argv);