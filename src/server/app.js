Vue.component('clock', {
  props: ['time'],
  template: `
    <span>{{ format(time) }}</span>
  `,
  methods: {
    format(time) {
      const date = new Date(time * 1000);
      const hour = date.getHours() % 12 == 0 ? 12 : date.getHours();
      const am = date.getHours() < 12 ? 'a' : 'p';
      return `${
        hour
      }:${
        (date.getMinutes() + '').padStart(2, 0)
      }${
        am
      }`;
    },
  },
});

Vue.component('tool', {
  props: ['icon', 'title'],
  data: () => ({
    focused: false,
  }),
  template: `
    <div :class="['tools', { focused }]">
      <header @click="focused = !focused">
        <i :class="['icon', 'fas', 'fa-' + icon]"></i> {{ title }}
      </header>
      <div class="content">
        <slot></slot>
      </div>
    </div>
  `,
});

Vue.component('toggle', {
  props: ['value', 'disabled', 'label'],
  template: `
    <span class="checkbox" @click="!disabled && $emit('input', !value)">
      <i :class="['fas', 'fa-' + (value ? 'check-square' : 'square'), { disabled }]"></i> {{ label }}
    </span>
  `
});

Vue.component('cal-day', {
  props: ['day', 'shows', 'todo', 'filters', 'settings'],
  methods: {
    hasLink(show, type) {
      return show.external_links.filter(link => link.site == type).length > 0;
    }
  },
  template: `
    <div class="calendar-day">
      <header>
        {{ day }}
      </header>
      <section class="calendar-shows">
        <article v-for="show in shows"
          class="calendar-show"
          v-if="(filters.showAll || show.onMyMal) && (
            filters.crunchy && hasLink(show, 'Crunchyroll') ||
            filters.amazon && hasLink(show, 'Amazon') ||
            !filters.crunchy && !filters.amazon
          )"
          :my-list="!!show.onMyMal"
          :key="show.id">
          <img :src="show.image">
          <div class="title">
            {{ settings.english ? show.title_english : show.title_romaji }}
          </div>
          <div class="episode" v-if="show.airing.next_episode">
            {{ show.airing.next_episode }}/{{ show.duration || '?' }}
          </div>
          <div class="time">
            <clock :time="show.airing.time"></clock>
          </div>
          <div class="todo" v-if="todo[show.id] && todo[show.id].count">
            {{
              todo[show.id].end - todo[show.id].begin <= 0 ?
              todo[show.id].begin :
              todo[show.id].begin + '-' + todo[show.id].end
            }}
          </div>
          <div class="links" v-if="!settings.hideLinks">
            <a v-for="link in show.external_links"
              v-if="link.site === 'Crunchyroll'"
              class="crunchy"
              target="_blank"
              onclick="clickLink(event)"
              :href="link.url"></a>
            <a v-for="link in show.external_links"
              v-if="link.site === 'Amazon'"
              target="_blank"
              class="amazon"
              onclick="clickLink(event)"
              :href="link.url"></a>
            <a class="mal"
              :href="show.mal_link"
              onclick="clickLink(event)"
              target="_blank"></a>
          </div>
        </article>
      </section>
    </div>
  `,
});

const app = new Vue({
  el: '#app',
  methods: {
    updateFilters(val) {
      localStorage.autocrFilters = JSON.stringify(this.filters);
    },
    updateSettings(val) {
      localStorage.autocrSettings = JSON.stringify(this.settings);
    }
  },
  data: {
    loading: true,
    filters: localStorage.autocrFilters ? JSON.parse(localStorage.autocrFilters) : {
      showAll: false,
      crunchy: false,
      amazon: false,
    },
    settings: localStorage.autocrSettings ? JSON.parse(localStorage.autocrSettings) : {
      english: false,
      hideLinks: false,
    },
    todo: {},
    calendar: {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
    },
  },
})

const isElectron = typeof require === 'function';

async function airing() {
  if(isElectron) {
    return await require('../animeutils.js').fetch.airing();
  } else {
    const resp = await fetch('/api/airing');
    return await resp.json({images: true});
  }
}

async function todo() {
  if(isElectron) {
    if(!require('../config.js').config)
      return [];

    return await require('../animeutils.js').fetch.todo();
  } else {
    const resp = await fetch('/api/todo');
    return await resp.json();
  }
}

function update() {
  airing().then(blob => {
    // Sort the shows by air time
    for(let day in blob) {
      blob[day] = blob[day].sort((a, b) =>
        a.airing.time - b.airing.time);
    }

    app.calendar = blob;
    app.loading = false;
  });

  todo().then(blob => {
    let todo = {};

    for(let show of blob)
      todo[show.ani_id] = show;

    app.todo = todo;
  });
}

update();
setInterval(update, 60 * 60 * 1000);

// Open link externally if we're in electron
function clickLink(event) {
  if(!isElectron)
    return;

  event.preventDefault();
  let link = event.target.href;
  require("electron").shell.openExternal(link);
}
