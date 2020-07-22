const fetch = require('node-fetch');
const _ = require('lodash');

const airingQuery = `
query ($page: Int, $perPage: Int, $date: Int) {
  Page(page: $page, perPage: $perPage) {
    page:pageInfo {
      lastPage
      total
      hasNextPage
    }
    shows:airingSchedules(notYetAired: true, airingAt_lesser: $date) {
      next: episode
      airing: airingAt
      countdown: timeUntilAiring
      meta: media {
        id
        mal: idMal
        title { romaji english }
        total: episodes
        status
        links: externalLinks { url site }
        description
        rating: averageScore
        genres
        image: coverImage { medium color }
      }
    }
  }
}
`;


function gqlQuery(query, variables={}) {
  return fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  .then(r => r.json());
}

// Get all the airing shows within a week
async function airing() {
  const oneWeek = Math.floor(Date.now() / 1000 + 60 * 60 * 24 * 7);
  const vars = { perPage: 50, date: oneWeek };

  // Fetch the first page
  const {data: {Page: { shows, page: {lastPage, total} }}} = await gqlQuery(airingQuery, { page: 1, ...vars });
  // Fetch the rest of the pages
  const rest = await Promise.all(_.range(2, lastPage + 1).map(page =>
    gqlQuery(airingQuery, { page, ...vars })));

  // Return the concatenated pages
  return shows.concat(...rest.map(obj => obj.data.Page.shows));
}

// Build a week schedule for the airing shows
async function calendar() {
  // Get the airing shows
  const shows = await airing();

  const calendar = {
    sunday: [],
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
  };

  const days = Object.keys(calendar);

  for(const show of shows) {
    // put the show in its respective day based on airing time
    calendar[days[new Date(show.airing * 1000).getDay()]].push(show);
  }

  return calendar;
}

module.exports = { airing, calendar };
