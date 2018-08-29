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
const path = require('path');
const dateFormat = require('dateformat');

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

// Load config file
let config = fs.existsSync('config.yml') && yaml.safeLoad(fs.readFileSync('config.yml', 'utf8'));
config && mkdir(config.settings.output_dir);
const TEMP_BATCH_PATH = (config ? fs.realpathSync(config.settings.output_dir) + '/' : '') + '.crunchybatch.txt';

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
// If the show prop is given, do not run batch operations
function runCrunchy(show) {
  crunchy(process.argv = [
      '--user', config.settings.crunchyroll.username,
      '--pass', config.settings.crunchyroll.password,
      '--nametmpl', '{SERIES_TITLE} - s{SEASON_NUMBER}e{EPISODE_NUMBER}',
      '--output',  fs.realpathSync(config.settings.output_dir),
      '--ignoredub',
      ...(show ? [show] : ['--batch', TEMP_BATCH_PATH])
    ], err => {

      if(err)
        console.error(err);

      fs.existsSync(TEMP_BATCH_PATH) && fs.unlink(TEMP_BATCH_PATH, err => {
        err && console.error('Error removing temp file:', err);
      });
    });
}


// Search crunchyroll and resolve if we found a video
function searchCrunchyroll(title) {
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

// Try to get the Crunchyroll link by searching for videos based on the MAL show name
function guessFromMAL(mal_item) {
  return new Promise((resolve, reject) => {
    const {anime_url, anime_title} = mal_item;

    // Open the MAL show page and find the "English" or "Synonyms" section on the side bar
    request(`https://myanimelist.net${anime_url}`, async (err, resp, body) => {
      if(err) {
        return searchCrunchyroll(anime_title).then(resolve, reject);
      }

      try {
        // Show was found based on the title, easy for shows with English titles!
        return resolve(await searchCrunchyroll(anime_title));
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

if(config && !config.agree_to_license) {
  console.error('Before using this software you must read and agree to the LICENSE and set the agree_to_license property to true in the config.yml file');
  process.exit(1);
}

const program = require('commander')
  .description('autocr automates downloading anime from CrunchyRoll')
  .version(require('./package').version)
  .action(async show => {
    console.error('Invalid command. See --help for a list of available commands.');
    process.exit(1);
  });

// Enable/disable console.log/process.stdout.write
const log = console.log.bind(console);
const writeBackup = process.stdout.write.bind(process.stdout);
function setQuiet(enabled) {
  const none = () => {};
  console.log = enabled ? none : log;
  process.stdout.write = enabled ? none : writeBackup;
}

program
  .command('pull')
  .description('Pull currently watching shows from MyAnimeList and populate config file')
  .action(async () => {
    if(!config)
      return log('config.yml does not exist! run autocr init to create one');

    log('Fetching MAL...');
    // Get currently watching shows from MyAnimeList
    const list = await fetchList(config.settings.myanimelist.username);

    // Find the crunchyroll link for each of the shows
    const shows = await Promise.all(list.map(async show => ({
      title: show.anime_title,
      crunchyroll: await guessFromMAL(show),
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

    log('Config Updated!', newShows.length - beforeLen, 'shows added');
  });

program
  .command('cull')
  .description('Cull shows that are not currently watched from the config file')
  .action(async () => {
    if(!config)
      return log('config.yml does not exist! run autocr init to create one');

    log('Fetching MAL...');
    // Get currently watching shows from MyAnimeList
    const list = await fetchList(config.settings.myanimelist.username);
    
    const beforeLen = (config.shows || []).length;

    // Only remove shows that are not in the currently watching list
    const newShows = _.filter(config.shows || [], s => _.find(list, {anime_id: s.id}));

    // Remove shows not in the currently watching list from the config
    writeConfig(Object.assign(config, {
      shows: newShows,
    }));

    log('Config Updated!', beforeLen - newShows.length, 'shows removed');
  });

program
  .command('get')
  .description('Download latest episodes all at once')
  .action(async () => {
    if(!config)
      return log('config.yml does not exist! run autocr init to create one');

    log('Fetching MAL...');
    const list = await fetchList(config.settings.myanimelist.username);

    // Create the data dir if it doesn't already exist
    mkdir(config.settings.output_dir);
    
    // Build and write a batch file for crunchy
    const shows = _.sortBy( // download higher scored shows first :)
      (config.shows || []).map(s =>
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

program
  .command('watch')
  .description('Download latest episodes as they come out on CrunchyRoll')
  .action(() => {
    if(!config)
      return log('config.yml does not exist! run autocr init to create one');

    const watcher = chokidar.watch('file', {
      persistent: true,
      ignoreInitial: true
    });

    watcher
      .on('add', path =>  {
        setQuiet(false);
        path.match(/\.mp4$/) && log('Starting', path.match(/([^\/\\]+)\.mp4$/)[1]);
        path.match(/\.mkv$/) && log('Finished', path.match(/([^\/\\]+)\.mkv$/)[1]);
        setQuiet(true);
      });
      
    watcher.add(config.settings.output_dir + '/**');
    
    log('Starting CR Feed Watching...');

    setQuiet(true);
    watchFeed();
    setInterval(watchFeed, Math.max(config.settings.feed_interval_mins, 15) * 60000);
  });

let anichartHeaders;
// Cache headers needed for anichart api requests
function getACHeaders() {
  return new Promise((resolve, reject) => {
    if(anichartHeaders) 
      resolve(anichartHeaders);
    else {      
      request('http://anichart.net', (err, req, body) => {
        if(err)
          reject(err);
        else
          resolve(anichartHeaders = {
            'X-CSRF-TOKEN': req.headers['set-cookie'][0].match(/XSRF-TOKEN=(.+?);/)[1],
            Cookie: req.headers['set-cookie'].map(str => str.match(/^(.+?);/)[1]).join(';')
          });
      });
    }
  });
}

// Grab a free api token and run an api command
function anichart(url) {
  return new Promise(async (resolve, reject) => {
    request({
      url,
      headers: await getACHeaders(),
    }, (err, req, body) => {
      if(err)
        reject(err);
      else
        resolve(JSON.parse(body))
    });
  });
}

// Format seconds into a countdown clock string (3d 02h 01m)
function countdown(secs) {
  function pad(t) { return t < 10 ? '0' + t : t}

  return `${Math.floor(secs / 60 / 60 / 24)}d ${pad(Math.floor(secs / 60 / 60) % 24)}h ${pad(Math.floor(secs / 60) % 60)}m`;
}

program
  .command('airing')
  .description('View currently airing shows from AniChart')
  .option('-a, --all', 'Show all series information')
  .option('-d, --description', 'Show series descriptions')
  .option('-e, --english', 'Show series english titles')
  .option('-g, --genre', 'Show series genre')
  .option('-l, --list', 'Only display shows in the config file shows list')
  .option('-L, --animelist', 'Only display shows in the config MyAnimeList')
  .option('-m, --minimal', 'Show only times and romaji titles')
  .option('-r, --rating', 'Show series ratings')
  .option('-t, --time', 'Show time until next episode')
  .action(async flags => {
    flags = Object.keys(flags);
    const minimal = flags.includes('minimal');
    const listOnly = flags.includes('list');
    const animeListOnly = flags.includes('animelist');
    const showTime = flags.includes('time');

    if(!config && (listOnly || animeListOnly))
      return log('config.yml does not exist! run autocr init to create one');

    const hasFlag = flags.includes('all') ? () => true : flags.includes.bind(flags);

    log('Fetching AniChart...');
    animeListOnly && log('Fetching MyAnimeList...');
    const malPromise = animeListOnly && fetchList(config.settings.myanimelist.username);
    const airing = await anichart('http://anichart.net/api/airing');
    const mal = malPromise ? await malPromise : [];

    // Only display shows with crunchyroll links
    const filtered = _.mapValues(airing, shows =>
      shows.filter(show => {
        
        if(animeListOnly) {
          const malId = show.mal_link.match(/\d+$/);
          return malId && _.find(mal, {anime_id: parseInt(malId[0])});
        }

        const crLink = _.find(show.external_links, {site: 'Crunchyroll'});
        if(listOnly && crLink) {
          return _.find((config.shows || []), s => s.crunchyroll.match(crLink.url));
        }

        return animeListOnly || crLink;
      })
    );


    // Display shows ordered in monday first week day order
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach(day => {
      log(` ---- ${day[0].toUpperCase() + day.slice(1)} ----`);
      if(filtered[day].length === 0)
        log(`  Nothing ${day}!`);

      _.sortBy(filtered[day], 'airing.time').forEach(show => {
        const time = dateFormat(new Date(show.airing.time * 1000), 'hh:MM TT');

        if(minimal)
          return log(`  ${time}${showTime ? ` [${countdown(show.airing.countdown)}]` : ''} - ${show.title_romaji}${showTime ? ` - ${show.airing.next_episode}/${show.total_episodes || '?'}`: ''}`);

        const crLink = (_.find(show.external_links, {site: 'Crunchyroll'}) || {}).url;

        log(
`  ${time}${showTime ? ` [${countdown(show.airing.countdown)}]` : ''} - ${show.title_romaji}${showTime ? ` - ${show.airing.next_episode}/${show.total_episodes || '?'}`: ''} ${
  hasFlag('english') ? `
    Title: ${show.title_english}` : ''}
      MAL: ${show.mal_link}
       CR: ${crLink || 'n/a'}${
  hasFlag('description') ? `
     Desc: ${show.description.replace(/<br>|(\n+\(Source: .+\))/g, '')}`
   : ''}${
  hasFlag('rating') ? `
    Score: ${Math.floor(show.average_score/10)}/10`
   : ''}${
  hasFlag('genre') ? `
    Genre: ${show.genres.filter(g => g).join(', ')}`
   : ''}
`);
      });
      log('\n');
    });
  });

program
  .command('search <title>')
  .option('-d, --download', 'Download the entire show from the search result')
  .description('Search CrunchyRoll for the given title and return a crunchyroll link')
  .action(async (title, flags) => {
    flags = Object.keys(flags);
    const hasFlag = flags.includes.bind(flags);
    try {
      const url = await searchCrunchyroll(title);
      if(hasFlag('download')) {
        if(!config)
          return log('config.yml does not exist! run autocr init to create one');
        runCrunchy(url);
      } else
        log(url);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Creates the default config.yml if it does not already exist')
  .action(() => {
    // Create the default config file
    if(!fs.existsSync('config.yml')) {
      log('Remember to update the default values in your newly created config.yml!');
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
    } else {
      log('config.yml already exists!');
    }
  });

program
  .command('todo')
  .description('Figure out which episodes have not been watched')
  .action(async flags => {
    if(!config)
      return log('config.yml does not exist! run autocr init to create one');

    log('Fetching AniChart and MyAnimeList...');
    const malPromise = fetchList(config.settings.myanimelist.username);
    const airing = _.flatten(_.values(await anichart('http://anichart.net/api/airing')));
    const mal = await malPromise;

    mal.map(show => {
      const base = {title: show.anime_title, total: show.anime_num_episodes, score: show.score};
      if(show.anime_airing_status === 1) {
        const meta = _.find(airing, {mal_link: `http://myanimelist.net/anime/${show.anime_id}`}) || {airing: {next_episode: 0}};
        return {count: (meta.airing.next_episode - 1) - show.num_watched_episodes, ...base};
      }
      if(show.anime_airing_status === 2) {
        return {count: show.num_watched_episodes - show.anime_num_episodes, ...base};
      }
      return {count: 0};
    })
    .filter(blob => blob.count > 0)
    .sort((a, b) => b.score - a.score)
    .forEach(blob => {
      log(`${_.padStart(blob.count, 3)}/${_.padEnd(blob.total, 3)} - ${blob.title}`);
    });

  });

// Parse command line args and run commands!
program.parse(process.argv);