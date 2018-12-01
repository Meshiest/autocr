# Auto Crunchy (autocr)

This handy dandy anime tool automates a number of things to provide the laziest anime experience possible!

1. Interfaces with [Crunchy](https://github.com/Godzil/Crunchy) to download shows!
2. Interfaces with [MyAnimeList](https://myanimelist.net/) to know what you're watching!
3. Interfaces with [AniChart](http://anichart.net/) to browse airing shows!
4. Interfaces with [because.moe](https://because.moe/) to search for crunchyroll links!

The only features that do not require a config file are: `autocr search` and `autocr airing`

## Legal Warning

This application is not endorsed or affliated with CrunchyRoll, MyAnimeList, or AniChart. The usage of this application enables episodes to be downloaded for offline convenience which may be forbidden by law in your country. Usage of this application may also cause a violation of the agreed Terms of Service between you and the stream provider. A tool is not responsible for your actions; please make an informed decision prior to using this application.

***ONLY* USE THIS TOOL TO DOWNLOAD ANIME IF YOU HAVE A *PREMIUM* CRUNCHYROLL ACCOUNT**

There are a few features that do not necessitate downloading any anime!

## Dependencies

* [NodeJS](https://nodejs.org/) >= 8.1
* [NPM](https://www.npmjs.org/) >= 5.8

## Installation (User)

1. `npm i -g git+https://github.com/Meshiest/autocr` - Install autocr
2. `autocr init` - Create default config file in current directory

Update with `npm i -g git+https://github.com/Meshiest/autocr`

## Installation (Developer)

1. `git clone http://github.com/Meshiest/autocr` - Clone the repo
2. `cd autocr` - Enter the directory
3. `npm install` - Install node dependencies
4. `npm link` - Add this library to your node_modules
5. `npm install $(pwd)` - Update your PATH to have `autocr`
6. `autocr init` - Create default config file in current directory

Update with `git pull` in the repo folder

## Standalone Dashboard (Windows)

Create a shortcut with:

* Target: `C:/path/to/autocr/node_modules/electron/dist/electron.exe C:/path/to/autocr/src/window.js`
* Start in: `C:/path/to/autocr/src`
* Icon: Navigate to `autocr/src/server/favicon.ico`

## Commands
  
    -h, --help                 output usage information
    pull|p                     Pull currently watching shows from MyAnimeList and populate config file
    cull|c                     Cull shows that are not currently watched from the config file
    get|g                      Download latest episodes all at once
    watch|w                    Download latest episodes as they come out on CrunchyRoll
    update|u                   Download latest episodes and keep downloading as they come out
    airing|a [options]         View currently airing shows from AniChart
      -a, --all                Show all series information
      -d, --description        Show series descriptions
      -e, --english            Show series english titles
      -g, --genre              Show series genre
      -l, --list               Only display shows in the config file shows list
      -L, --animelist          Only display shows in the config MyAnimeList
      -m, --minimal            Show only times and romaji titles
      -r, --rating             Show series ratings
      -t, --time               Show time until next episode
      -h, --help               output usage information
    search|s [options] <title> Search Because.moe for the given title and return a crunchyroll link
      -a, --add                Add the found show to the config
      -c, --crunchy            Search with crunchyroll
      -d, --download           Download the entire show from the search result
      -e, --episode <eps>      Specify which episodes to download (in format crunchy uses)
      -m, --myanimelist        Also find MyAnimeList entry for the discovered show
      -h, --help               output usage information
    init|i [options]           Creates the default config.yml if it does not already exist
      -H, --home               Write config to home directory
      -h, --help               output usage information
    todo|t [options]           Figure out which episodes have not been watched
      -a, --airing             Only show airing shows
      -c, --count              Show number of unwatched episodes
      -e, --episode            Display unwatched episode numbers
      -l, --list               Only display shows from the config list
      -s, --sort               Sort by number of episodes (instead of score)
      -h, --help               output usage information
    dash|d [options]           Runs a webserver with todo and airing pages in fancy format
      -w, --window             Pop up an electron window
      -h, --help               output usage information

## Screenshots (Dashboard)

<img src="https://i.imgur.com/qXXNTTL.jpg" width="512"/>
<img src="https://i.imgur.com/32i8kIW.jpg" width="512"/>

## Custom Dashboard Backgrounds

Backgrounds can be placed in the `project-root/custom_backgrounds` folder or in a folder titled `custom_backgrounds` inside the `output_dir` as listed under the settings section in your `config.yml`. Names will automatically be transformed in the dashboard settings menu from `kebab-case.jpg` or `snake_case.jpg` to `Kebab Case` and `Snake Case` respectively.

## Notes

* `autocr pull` will sometimes add shows that are not on crunchyroll, you will need to browse your config.yml to ensure you only have shows you want
* `autocr get` will download everything AFTER the currently watched episode. If you want to download the entire show, use `crunchy` or `autocr search -d "show name"`
* `autocr search` requires quotes when searching for multi word titles (`autocr search "my github academia"`)