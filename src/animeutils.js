const request = require('request');
const cheerio = require('cheerio');
const { parseString: parseXML } = require('xml2js');
const { config } = require('./config.js');
const _ = require('lodash');

const CR_URL_REGEX = /https?:\/\/www.crunchyroll\.com\/(.+?)\//;

// Grabs a user's list in JSON form
function fetchList(name, status=1) {
  return new Promise((resolve, reject) => {
    request(`https://myanimelist.net/animelist/${name}?status=${status}`, (err, resp, body) => {
      if(err)
        return reject(err);
      const $ = cheerio.load(body);
      resolve(JSON.parse($('.list-block table').attr('data-items') || '[]'));
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

let becauseCache; // Cache because.moe info
// Get the show info json from because.moe
function fetchBecause() {
  return new Promise((resolve, reject) => {
    if(becauseCache)
      return resolve(becauseCache);

    request('https://bcmoe.blob.core.windows.net/assets/us.json', (err, resp, body) => {
      if(err)
        return reject(err);
      try {
        becauseCache = JSON.parse(body).shows;
        resolve(becauseCache);
      } catch (err) {
        reject(err);
      }
    });
  })
}

// Search because.moe for a title
async function searchBecause(title) {
  const search = new RegExp((title || '').split('').join('.*'), 'i');
  return (await fetchBecause())
    .filter(show => show.name.match(search))
    .map(show => show.sites.crunchyroll)[0];
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

// Search myanimelist and return the first found anime's [url, name]
function searchMAL(term) {
  return new Promise((resolve, reject) => {
    request(`https://myanimelist.net/search/all?q=${term}`, (err, resp, body) => {
      if(err) {
        return reject(err);
      }

      const $ = cheerio.load(body);
      const anime = $('.content-left h2#anime + article .list .information a.fw-b');

      resolve(Array.from(anime).map(e => [e.attribs.href, e.children[0].data])[0]);
    });
  });
}

// Try to get the Crunchyroll link by searching for videos based on the MAL show name
function guessFromMAL(mal_item) {
  return new Promise((resolve, reject) => {
    const {anime_url, anime_title} = mal_item;

    const becauseRes = searchBecause(anime_title);
    if(becauseRes)
      return resolve(becauseRes);

    // Open the MAL show page and find the "English" or "Synonyms" section on the side bar
    request(`https://myanimelist.net${encodeURI(anime_url)}`, async (err, resp, body) => {
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

// Get a list of shows the user needs to catch up with
async function todo(options) {
  options = options || {};
  options.ptw = options.ptw || false;

  if(!config)
    return [];

  const malPromise = fetchList(config.settings.myanimelist.username, 1);
  const airing = _.flatten(_.values(await anichart('http://anichart.net/api/airing')));

  return (await malPromise).map(show => {
    const base = {
      title: show.anime_title,
      total: show.anime_num_episodes,
      score: show.score,
      mal_id: show.anime_id,
      mal: `http://myanimelist.net/anime/${show.anime_id}`,
    };

    if(options.images)
      base.image = show.anime_image_path;

    if(show.anime_airing_status === 1) {
      const meta = _.find(airing, {mal_link: `http://myanimelist.net/anime/${show.anime_id}`}) || {airing: {next_episode: 0}};
      return {
        count: (meta.airing.next_episode - 1) - show.num_watched_episodes,
        begin: show.num_watched_episodes + 1,
        end: (meta.airing.next_episode - 1),
        ani_id: meta.id,
        airing: true,
        ...base
      };
    }
    if(show.anime_airing_status === 2) {
      return {
        count: show.anime_num_episodes - show.num_watched_episodes,
        begin: show.num_watched_episodes + 1,
        end: show.anime_num_episodes,
        airing: false,
        ...base
      };
    }
    return {count: 0};
  });
}

async function airing() {
  const malPromise = config && Promise.all([fetchList(config.settings.myanimelist.username, 2), fetchList(config.settings.myanimelist.username, 6)]);
  const airing = await anichart('http://anichart.net/api/airing');
  const mal = (malPromise ? [].concat(...await malPromise) : []).filter(s => s.status !== 4 && s.status !== 2);
  const mal_obj = mal.reduce((obj, a) => ({...obj, [a.anime_id]: a}), {});

  _.each(airing, shows => {
    shows.map(show => {
      const malId = show.mal_link.match(/\d+$/);
      const crLink = _.find(show.external_links, {site: 'Crunchyroll'});
      show.crLink = crLink;

      show.onMyMal = mal_obj[malId];
      show.onMyConfig = config && config.shows && crLink && _.find(config.shows, s => s.crunchyroll.match(crLink.url));
    });
  });

  return airing;
}

// Every function in this module returns a promise
module.exports = {
  fetch: {
    mal: fetchList,
    feed: fetchFeed,
    because: fetchBecause,
    todo,
    anichart,
    airing,
  },
  search: {
    because: searchBecause,
    crunchy: searchCrunchyroll,
    mal: searchMAL,
  },
  guessFromMAL,
  CR_URL_REGEX,
};
