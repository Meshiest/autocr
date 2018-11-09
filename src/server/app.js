Vue.component('clock', {
  props: ['time'],
  template: `
    <span>{{ format(time) }}</span>
  `,
  methods: {
    format(time) {
      const date = new Date(time * 1000);
      const hour = date.getHours() % 12 == 0 ? 12 : date.getHours();
      const am = date.getHours() < 12 ? 'AM' : 'PM';
      return `${
        hour
      }:${
        (date.getMinutes() + '').padStart(2, 0)
      } ${
        am
      }`;
    }
  }
})

Vue.component('cal-day', {
  props: ['day', 'shows'],
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
          <div class="time">
            <clock v-bind:time="show.airing.time"></clock>
          </div>
          <div class="links">
            <a class="mal" v-bind:href="show.mal_link"></a>
            <a v-for="link in show.external_links"
              v-if="link.site == 'Crunchyroll'"
              class="crunchy"
              v-bind:href="link.url"></a>
            <a v-for="link in show.external_links"
              v-if="link.site == 'Amazon'"
              class="amazon"
              v-bind:href="link.url"></a>
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
    calendar: {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
    },
  },
})

fetch('/api/airing').then(resp =>
  resp.json().then(blob => {
    // Sort the shows by air time
    for(let day in blob) {
      blob[day] = blob[day].sort((a, b) =>
        a.airing.time - b.airing.time);
    }

    app.calendar = blob;
    app.loading = false;
    console.log(blob);
  }));
