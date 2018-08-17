const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const yaml = require('js-yaml');
const { batch } = require('./node_modules/crunchy/dist');
const format = require('string-format');
const request = require('request');
const commander = require('commander');
const cheerio = require('cheerio');

function mkdir(dir) {
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
  }
}

function writeConfig(obj) {
  fs.writeFileSync('config.yml', yaml.safeDump(obj));
}

if(!fs.existsSync('config.yml')) {
  writeConfig({
    agree_to_license: false,
    settings: {
      mal_username: 'MAL_USERNAME',
      crunchy: {
        username: 'CRUNCHYROLL_USERNAME',
        password: 'CRUNCHYROLL_PASSWORD',
      },
      data_dir: 'data',
      download_dir: 'downloads',
    },
    shows: null,
  });
}

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

function guessCrunchyroll(mal_item) {
  return new Promise((resolve, reject) => {
    const {anime_url, anime_title} = mal_item;
    function tryTitle(title) {
      return new Promise((resolve, reject) => {
        request(`http://www.crunchyroll.com/search?from=search&q=${title.replace(/ /g, '+')}`, (err, resp, body) => {
          if(err)
            return reject(err);
          const $ = cheerio.load(body);
          const elem = $('#aux_results li a');
          const url = elem[0] && elem[0].attribs.href;
          const link = url && url.match(/https?:\/\/www.crunchyroll\.com\/(.+?)\//);
          if(url && link) {
            resolve(link[0]);
          } else {
            reject('No videos...');
          }
        });
      });
    }
    request(`https://myanimelist.net${anime_url}`, async (err, resp, body) => {
      if(err) {
        return tryTitle(anime_title).then(resolve, reject);
      }

      try {
        return resolve(await tryTitle(anime_title));
      } catch (e) {
        // nothing to do..
      }

      const $ = cheerio.load(body);
      const elem = $('h2 + div.spaceit_pad > span.dark_text');
      if(elem[0]) {
        switch(elem[0].children[0].data) {
        case 'Synonyms:':
          const titles = elem[0].next.data.split(',').map(t => t.trim());
          for(let i = 0; i < titles.length; i++) {
            try {
              return resolve(await tryTitle(titles[i]));
            } catch (e) {
              continue;
            }
          }
          reject('Could not find based on synonyms');
          break;
        case 'English:':
          try {
            return resolve(await tryTitle(elem[0].next.data.trim()));
          } catch (e) {
            reject('Could not find based on english title');
          }
          break;
        }
      }

      reject('Could not find based on standard title');
    })
    

  });
}

let config = yaml.safeLoad(fs.readFileSync('config.yml', 'utf8'));

if(!config.agree_to_license) {
  console.error('Before using this software you must read and agree to the LICENSE and set the agree_to_license property to true in the config.yml file');
  process.exit(0);
}

const program = require('commander')
  .version(require('./package').version);

program
  .command('pull')
  .description('Pull currently watching shows from MyAnimeList and populate config file')
  .action(async () => {
    console.log('Fetching MAL...');
    const list = await fetchList(config.settings.mal_username);
    list.forEach(i => {
      guessCrunchyroll(i).then(a => 
        console.log(i.anime_title, '=', a),
      b =>
        console.log(i.anime_title, '???')
      );
    })
  });

program
  .command('link', 'Find Crunchyroll links for each of the shows in the config file')
  .action(() => {
    console.log('foo');
  });


// console.log(batch);
program.parse(process.argv);