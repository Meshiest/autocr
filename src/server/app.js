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

Vue.component('cal-day', {
  props: ['day', 'shows', 'todo'],
  template: `
    <div class="calendar-day">
      <header>
        {{ day }}
      </header>
      <section class="calendar-shows">
        <article v-for="show in shows"
          class="calendar-show"
          v-if="show.onMyMal"
          v-bind:key="show.id">
          <img v-bind:src="show.image">
          <div class="title">
            {{ show.title_romaji }}
          </div>
          <div class="episode" v-if="show.airing.next_episode">
            {{ show.airing.next_episode }}/{{ show.duration || '?' }}
          </div>
          <div class="time">
            <clock v-bind:time="show.airing.time"></clock>
          </div>
          <div class="todo" v-if="todo[show.id] && todo[show.id].count">
            {{
              todo[show.id].end - todo[show.id].begin <= 0 ?
              todo[show.id].begin :
              todo[show.id].begin + '-' + todo[show.id].end
            }}
          </div>
          <div class="links">
            <a v-for="link in show.external_links"
              v-if="link.site == 'Crunchyroll'"
              class="crunchy"
              target="_blank"
              onclick="clickLink(event)"
              v-bind:href="link.url"></a>
            <a v-for="link in show.external_links"
              v-if="link.site == 'Amazon'"
              target="_blank"
              class="amazon"
              onclick="clickLink(event)"
              v-bind:href="link.url"></a>
            <a class="mal"
              v-bind:href="show.mal_link"
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
  data: {
    loading: true,
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

function update() {
  fetch('/api/airing').then(resp =>
    resp.json().then(blob => {
      // Sort the shows by air time
      for(let day in blob) {
        blob[day] = blob[day].sort((a, b) =>
          a.airing.time - b.airing.time);
      }

      app.calendar = blob;
      app.loading = false;
    }));

  fetch('/api/todo').then(resp =>
    resp.json().then(blob => {
      let todo = {};

      for(let show of blob)
        todo[show.ani_id] = show;

      app.todo = todo;
    }));
}

update();
setInterval(update, 60 * 60 * 1000);

// Open link externally if we're in electron
function clickLink(event) {
  if(typeof require !== 'function')
    return;

  event.preventDefault();
  let link = event.target.href;
  require("electron").shell.openExternal(link);
}
