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
  props: ['day', 'shows', 'f', 'filters', 'settings', 'ptw', 'todo'],
  methods: {
    hasLink(show, type) {
      return show.meta.links.filter(link => link.site == type).length > 0;
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
          v-if="(filters.showAll || show.onMyMal) &&
            (show.onMyMal && show.onMyMal.status == 6 ? settings.showPTW : true) && (
            filters.crunchy && hasLink(show, 'Crunchyroll') ||
            filters.amazon && hasLink(show, 'Amazon') ||
            !filters.crunchy && !filters.amazon
          )"
          :my-list="!!show.onMyMal"
          :key="show.meta.id">
          <img :src="show.meta.image.medium" :style="'background: ' + show.meta.image.color">
          <div class="title">
            {{ settings.english && show.meta.title.english || show.meta.title.romaji }}
          </div>
          <div class="episode" v-if="show.next">
            {{ show.next }}/{{ show.meta.total || '?' }}
          </div>
          <div class="time">
            <clock :time="show.airing"></clock>
          </div>
          <div class="todo" v-if="todo[show.meta.id] && todo[show.meta.id].count">
            <i class="fas fa-clock" v-if="settings.showPTW && show.onMyMal && show.onMyMal.status == 6"></i>
            {{
              todo[show.meta.id].end - todo[show.meta.id].begin <= 0 ?
              todo[show.meta.id].begin :
              todo[show.meta.id].begin + '-' + todo[show.meta.id].end
            }}
          </div>
          <div class="todo" v-if="settings.showPTW &&
            show.onMyMal && show.onMyMal.status == 6 &&
            !(todo[show.meta.id] && todo[show.meta.id].count)">
            <i class="fas fa-clock"></i>
          </div>
          <div :class="['links', {hidden: settings.hideLinks}]">
            <a v-for="link in show.meta.links"
              v-if="link.site === 'Crunchyroll'"
              class="crunchy"
              target="_blank"
              onclick="clickLink(event)"
              :href="link.url"></a>
            <a v-for="link in show.meta.links"
              v-if="link.site === 'Amazon'"
              target="_blank"
              class="amazon"
              onclick="clickLink(event)"
              :href="link.url"></a>
            <a class="mal"
              :href="'https://myanimelist.net/anime/' + show.meta.mal"
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
    return await require('../animeutils').fetch.airing();
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
    const { backgrounds } = require('../config');
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

async function todo(ptw=false) {
  if(isElectron) {
    if(!require('../config.js').config)
      return [];

    return await require('../animeutils.js').fetch.todo({ptw});
  } else {
    const resp = await fetch(ptw ? '/api/ptw' : '/api/todo');
    return await resp.json();
  }
}

function update() {
  airing().then(blob => {
    for(let day in blob) {
      // Sort by airing time
      blob[day] = blob[day].sort((a, b) =>
        a.airing - b.airing);

      // Remove duplicate entries (silly anilist)
      blob[day] = blob[day].filter((b, i) =>
        blob[day].findIndex(e => e.meta.id === b.meta.id) === i);
    }

    app.calendar = blob;
    app.loading = false;
  });

  todo().then(blob => {
    const todo = {};

    for(let show of blob)
      if(show.ani_id)
        todo[show.ani_id] = show;
      else
        todo['mal' + show.mal_id] = show;

    app.todo = todo;

  });
  todo(true).then(blob => {
    let ptw = [];
    ptw.todo = {};

    for(let show of blob) {      
      if(show.begin)
        ptw.push(show);
      if(show.ani_id)
        ptw.todo[show.ani_id] = show;
      else
        ptw.todo['mal' + show.mal_id] = show;
    }

    ptw.sort((a, b) => b.count - a.count);
    ptw.sort((a, b) => (b.airing ? 1 : 0) - (a.airing ? 1 : 0));

    app.ptw = ptw;
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
      return Object.values(this.todo)
        .sort((a, b) => (b.airing ? 1 : 0) - (a.airing ? 1 : 0))
        .sort((a, b) => b.count - a.count);
    },
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
      showPTW: false,
    },
    todo: {},
    ptw: {length: 0, todo: {}},
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
