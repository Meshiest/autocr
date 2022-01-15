const fetch = require('node-fetch');
const _ = require('lodash');
const { reject } = require('lodash');

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

async function gqlQuery(query, variables = {}) {
  const resp = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await resp.text();
  if (resp.statusCode > 300 || resp.statusCode < 200) {
    console.error(text);
    throw new Error('error code ' + resp.statusCode);
  }
  return JSON.parse(text);
}

let airingPending;

// Get all the airing shows within a week
async function airing() {
  if (airingPending) return await airingPending;

  let airingResolve, airingReject;
  airingPending = new Promise((resolve, reject) => {
    airingResolve = resolve;
    airingReject = reject;
  });

  try {
    const oneWeek = Math.floor(Date.now() / 1000 + 60 * 60 * 24 * 7);
    const vars = { perPage: 50, date: oneWeek };

    // Fetch the first page
    const {
      data: {
        Page: { shows, page },
      },
    } = await gqlQuery(airingQuery, { page: 1, ...vars });
    let { hasNextPage } = page;

    for (let i = 2; hasNextPage; i++) {
      const {
        data: {
          Page: { shows: moreShows, page },
        },
      } = await gqlQuery(airingQuery, { page: i, ...vars });
      shows.push(...moreShows);
      hasNextPage = page.hasNextPage;
    }

    airingResolve(shows);
    return shows;
  } catch (err) {
    airingReject(err);
  } finally {
    airingPending = null;
  }
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

  for (const show of shows) {
    // put the show in its respective day based on airing time
    calendar[days[new Date(show.airing * 1000).getDay()]].push(show);
  }

  return calendar;
}

module.exports = { airing, calendar };
