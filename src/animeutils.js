const request = require('request');
const cheerio = require('cheerio');
const { parseString: parseXML } = require('xml2js');

const CR_URL_REGEX = /https?:\/\/www.crunchyroll\.com\/(.+?)\//;

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

// Every function in this module returns a promise
module.exports = {
  fetch: {
    mal: fetchList,
    feed: fetchFeed,
    because: fetchBecause,
    anichart,
  },
  search: {
    because: searchBecause,
    crunchy: searchCrunchyroll,
    mal: searchMAL,
  },
  guessFromMAL,
  CR_URL_REGEX,
};