# Auto Crunchy (autocr)

This handy dandy tool automagically runs the [crunchy](https://github.com/Godzil/Crunchy) tool to download the shows you say you are watching on MyAnimeList! Also lets you browse airing shows with help from AniChart!

## Legal Warning

This application is not endorsed or affliated with CrunchyRoll, MyAnimeList, or AniChart. The usage of this application enables episodes to be downloaded for offline convenience which may be forbidden by law in your country. Usage of this application may also cause a violation of the agreed Terms of Service between you and the stream provider. A tool is not responsible for your actions; please make an informed decision prior to using this application.

***ONLY* USE THIS TOOL IF YOU HAVE A *PREMIUM* CRUNCHYROLL ACCOUNT**

## Dependencies

* [NodeJS](https://nodejs.org/) >= 8.1
* [NPM](https://www.npmjs.org/) >= 5.8

## Installation (Until I ever put this on npm)

1. `git clone http://github.com/meshiest/autocr` - Clone the repo
2. `cd autocr` - Enter the directory
3. `npm install` - Install node dependencies
4. `npm link` - Add this library to your node_modules
5. `npm install $(pwd)` - Update your PATH to have `autocr`
6. `autocr --help` - Create default config file and view help text

## Commands

    pull                      Pull currently watching shows from MyAnimeList and populate config file
    cull                      Cull shows that are not currently watched from the config file
    get                       Download latest episodes all at once
    watch                     Download latest episodes as they come out on CrunchyRoll
    airing [options]          View currently airing shows from AniChart
      -a, --all               Show all series information
      -d, --description       Show series descriptions
      -e, --english           Show series english titles
      -g, --genre             Show series genre
      -h, --help              output usage information
      -l, --list              Only display shows in the config file shows list
      -m, --minimal           Show only times and romaji titles
      -r, --rating            Show series ratings
      -t, --time              Show time until next episode
    search [options] <title>  Search CrunchyRoll for the given title and return a crunchyroll link
      -d, --download          Download the entire show from the search result
      -h, --help              output usage information


## Notes

* `autocr pull` will sometimes add shows that are not on crunchyroll, you will need to browse your config.yml to ensure you only have shows you want
* `autocr get` will download everything AFTER the currently watched episode. If you want to download the entire show, use `crunchy` until some form of `autocr all` is developed
