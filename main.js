const fs = require('fs');
const _ = require('lodash');
const commander = require('commander');
const chokidar = require('chokidar');
const path = require('path');
const dateFormat = require('dateformat');
const proc = require('child_process');

const { config, writeConfig, BLANK_CONFIG } = require('./src/config.js');
const { mkdir, log, setQuiet, countdown } = require('./src/utils.js');
const { fetch, search, guessFromMAL, CR_URL_REGEX } = require('./src/animeutils.js');
const { runCrunchy, watchFeed, TEMP_BATCH_PATH } = require('./src/crunchy.js');
const { startServer, startApp } = require('./src/server.js');

if(config && !config.agree_to_license) {
  console.error('Before using this software you must read and agree to the LICENSE and set the agree_to_license property to true in the config.yml file');
  process.exit(1);
}

/* -- Command line functions -- */
const program = require('commander')
  .description('autocr automates downloading anime from CrunchyRoll')
  .version(require('./package').version)
  .action(() => {
    console.error('Invalid command. See --help for a list of available commands.');
    process.exit(1);
  });

program
  .command('pull')
  .alias('p')
  .description('Pull currently watching shows from MyAnimeList and populate config file')
  .action(async () => {
    if(!config)
      return log('config.yml does not exist! run autocr init to create one');

    log('Fetching MAL...');
    const becausePromise = fetch.because();
    // Get currently watching shows from MyAnimeList
    const list = await fetch.mal(config.settings.myanimelist.username);
    await becausePromise;

    // Find the crunchyroll link for each of the shows
    const shows = await Promise.all(list.map(async show => ({
      title: show.anime_title,
      crunchyroll: await guessFromMAL(show),
      id: show.anime_id,
      offset: 0,
    })));

    const beforeLen = (config.shows || []).length;

    // Only add shows that are not already in the list
    const newShows = (config.shows || [])
      .concat(shows.filter(s => !_.find(config.shows, {id: s.mal_id})))
      .filter(show => show.crunchyroll);

    // Update the config with the found shows
    writeConfig(Object.assign(config, {
      shows: newShows,
    }));

    log('Config Updated!', newShows.length - beforeLen, 'shows added');
  });

program
  .command('cull')
  .alias('c')
  .description('Cull shows that are not currently watched from the config file')
  .action(async () => {
    if(!config)
      return log('config.yml does not exist! run autocr init to create one');

    log('Fetching MAL...');
    // Get currently watching shows from MyAnimeList
    const list = await fetch.mal(config.settings.myanimelist.username);
    
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
  .alias('g')
  .description('Download latest episodes all at once')
  .action(async () => {
    if(!config)
      return log('config.yml does not exist! run autocr init to create one');

    log('Fetching MAL...');
    const list = await fetch.mal(config.settings.myanimelist.username);

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

program
  .command('watch')
  .alias('w')
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

program
  .command('airing')
  .alias('a')
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
    const malPromise = animeListOnly && fetch.mal(config.settings.myanimelist.username);
    const airing = await fetch.anichart('http://anichart.net/api/airing');
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

        log(`  ${time}${showTime ? ` [${countdown(show.airing.countdown)}]` : ''} - ${show.title_romaji}${showTime ? ` - ${show.airing.next_episode}/${show.total_episodes || '?'}`: ''} ${
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
   : ''}\n`);
      });
      log('\n');
    });
  });

program
  .command('search <title>')
  .alias('s')
  .option('-a, --add', 'Add the found show to the config')
  .option('-c, --crunchy', 'Search with crunchyroll')
  .option('-d, --download', 'Download the entire show from the search result')
  .option('-e, --episode <eps>', 'Specify which episodes to download (in format crunchy uses)')
  .option('-m, --myanimelist', 'Also find MyAnimeList entry for the discovered show')
  .description('Search because.moe for the given title and return a crunchyroll link')
  .action(async (query, options) => {
    const flags = Object.keys(options);
    const hasFlag = flags.includes.bind(flags);
    try {
      const url = await (hasFlag('crunchy') ? search.crunchy : search.because)(query);
      
      if(!url) {
        console.error('No show found');
        process.exit(1);
      }

      // Search mal/add to list flag
      if(hasFlag('myanimelist') || hasFlag('add')) {
        const [mal, title] = await search.mal(query);

        if(hasFlag('add')) {
          if(!config)
            return log('config.yml does not exist! run autocr init to create one');

          const show = {
            title,
            crunchyroll: url,
            id: parseInt(mal.match(/\d+/)[0]),
            offset: 0,
          };

          // Avoid duplicate entries
          if(!_.find(config.shows, {crunchyroll: url})) {
            writeConfig(Object.assign(config, {shows: config.shows.concat(show)}));
            log(mal, 'added');
          } else {
            log(mal, 'already added');
          }
        } else {
          log(mal);
        }
      }


      if(hasFlag('download')) {
        if(!config)
          return log('config.yml does not exist! run autocr init to create one');
        runCrunchy(url, ...(hasFlag('episode') ? ['-e', options.episode] : []));
      } else
        log(url);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command('init')
  .alias('i')
  .description('Creates the default config.yml if it does not already exist')
  .option('-H, --home', 'Write config to home directory')
  .action(options => {
    const flags = Object.keys(options);
    const hasFlag = flags.includes.bind(flags);

    // Create the default config file
    if(!config) {
      log('Remember to update the default values in your newly created config file!');
      writeConfig(BLANK_CONFIG, true, hasFlag('home'));
    } else {
      log('Config file already exists!');
    }
  });

program
  .command('todo')
  .alias('t')
  .description('Figure out which episodes have not been watched')
  .option('-a, --airing', 'Only show airing shows')
  .option('-c, --count', 'Show number of unwatched episodes')
  .option('-e, --episode', 'Display unwatched episode numbers')
  .option('-l, --list', 'Only display shows from the config list')
  .option('-s, --sort', 'Sort by number of episodes (instead of score)')
  .action(async flags => {
    flags = Object.keys(flags);
    const hasFlag = flags.includes.bind(flags);
    const sortEpisode = hasFlag('sort');

    if(!config)
      return log('config.yml does not exist! run autocr init to create one');

    log('Fetching AniChart and MyAnimeList...\n');

    let total = 0;
    (await fetch.todo())
      .filter(blob => blob.count > 0)
      .filter(blob => hasFlag('list') ? _.find(config.shows || [], {id: blob.id}) : true)
      .filter(blob => hasFlag('airing') ? blob.airing : true)
      .sort((a, b) => sortEpisode ? b.count - a.count : b.score - a.score)
      .forEach(blob => {
        total += blob.count;
        const start = hasFlag('episode') ? (
          _.padStart(blob.end - blob.begin <= 0 ? blob.begin : blob.begin + '-' + blob.end, 7)
        ) : _.padStart(blob.count, 3);

        log(`${start}/${_.padEnd(blob.total || '?', 3)} - ${blob.airing && !hasFlag('airing') ? '*' : ''}${blob.title}`);
      });

    if(hasFlag('count'))
      log('\nTotal Episodes:', total);
  });

program
  .command('dash')
  .alias('d')
  .description('Runs a webserver with todo and airing pages in fancy format')
  .option('-w, --window', 'Pop up an electron window')
  .action(options => {
    const flags = Object.keys(options);
    const hasFlag = flags.includes.bind(flags);

    if(!config)
      return log('config.yml does not exist! run autocr init to create one');

    if(hasFlag('window')) {
      startApp();
    } else {
      startServer();
    }
  });

program
  .command('update')
  .alias('u')
  .description('Download latest episodes and keep downloading as they come out')
  .action(() => {
    const sp = proc.spawn(process.argv[0], process.argv.slice(1).map(a => a.replace(/^u(pdate)?$/, 'get')));

    sp.stdout.on('data', data => {
      process.stdout.write(data.toString());
    });

    sp.stderr.on('data', data => {
      process.stderr.write(data.toString());
    });

    sp.on('error', err => {
      console.log('failed to start process', err);
    });

    sp.on('exit',(code, signal) => {
      program.emit('command:watch');
    });
  });

// Parse command line args and run commands!
program.parse(process.argv);