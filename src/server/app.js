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
    <div class="checkbox" @click="!disabled && $emit('input', !value)">
      <i :class="['fas', 'fa-' + (value ? 'check-square' : 'square'), { disabled }]"></i> {{ label }}
    </div>
  `,
});

Vue.component('dropdown', {
  props: ['value', 'disabled', 'label', 'options'],
  template: `
    <div class="dropdown">
      <label for="dropdown">
        {{ label }}
      </label>
      <select name="dropdown"
        :disabled="disabled"
        @input="$emit('input', $event)"
        v-model="JSON.stringify(value)">
        <option v-for="option in options"
          :value="JSON.stringify(option.value)">
          {{ option.text }}
        </option>
      </select>
    </div>
  `,
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
            {{ show.airing.next_episode }}/{{ show.total_episodes || '?' }}
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
          <div :class="['links', {hidden: settings.hideLinks}]">
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

const isElectron = typeof require === 'function';

async function airing() {
  if(isElectron) {
    return await require('../animeutils.js').fetch.airing();
  } else {
    const resp = await fetch('/api/airing');
    return await resp.json();
  }
}

function transformStr(str) {
  return str
    .replace(/^.+[\\\/]/, '')
    .replace(/\.\w+$/, '')
    .replace(/(^|[-_])(\w)/g, c => c.toUpperCase())
    .replace(/[-_]/g, ' ');
}

async function backgroundList() {
  let bgs = [];

  if(isElectron) {
    const { config, backgrounds } = require('../config.js');
    const fs = require('fs');
    bgs = backgrounds(true).map(bg => ({
      text: transformStr(bg),
      value: {type: 'image', value: bg},
    }));

  } else {
    const resp = await fetch('/api/backgrounds');
    bgs = (await resp.json()).map(bg => ({
      text: transformStr(bg),
      value: {type: 'image', value: `bg/${bg}`},
    }));
  }

  return bgs;
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

const app = new Vue({
  el: '#app',
  methods: {
    updateFilters() {
      localStorage.autocrFilters = JSON.stringify(this.filters);
    },
    updateSettings() {
      this.updateBG();
      localStorage.autocrSettings = JSON.stringify(this.settings);
    },
    updateBG(bg) {
      bg = bg || this.settings.background || {type: 'class', value: 'default-bg'};
      this.settings.background = bg;
      if(bg.type === 'class') {
        document.body.className = bg.value;
        document.body.style.setProperty('--background', '');
      } else {
        document.body.className = 'image';
        document.body.style.setProperty('--background', `url(${bg.value})`);
        // document.body.style.backgroundImage = `url(${bg.value})`;
      }
      if(this.settings.blurBg)
        document.body.className += ' blur';
    }
  },
  created() {
    this.updateBG();
    backgroundList().then(bgs => {
      this.backgrounds = this.backgrounds.concat(bgs);
    });
  },
  computed: {
    sortedTodo() {
      let arr = [];
      for(let i in this.todo) {
        arr.push(this.todo[i]);
      }
      return arr.sort((a, b) => b.count - a.count);
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
    backgrounds: [
      {text: 'Default Gradient', value: {type: 'class', value: 'default-bg'}},
      {text: 'Light Gray', value: {type: 'class', value: 'grey-bg'}},
      {text: 'Rainy Sky', value: {type: 'image', value: 'img/rainy-sky.jpg'}},
      {text: 'Roof Fence', value: {type: 'image', value: 'img/roof-fence.jpg'}},
      {text: 'Sunset Coast', value: {type: 'image', value: 'img/sunset-coast.jpg'}},
      {text: 'Seaside Pool', value: {type: 'image', value: 'img/seaside-pool.jpg'}},
    ],
  },
});
