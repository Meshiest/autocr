# Auto Crunchy (autocr)

This handy dandy tool automagically runs the [crunchy](https://github.com/Godzil/Crunchy) tool to download the shows you say you are watching on MyAnimeList!

## Legal Warning

This application is not endorsed or affliated with CrunchyRoll or MyAnimeList. The usage of this application enables episodes to be downloaded for offline convenience which may be forbidden by law in your country. Usage of this application may also cause a violation of the agreed Terms of Service between you and the stream provider. A tool is not responsible for your actions; please make an informed decision prior to using this application.

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

## Notes

* `autocr pull` will sometimes add shows that are not on crunchyroll, you will need to browse your config.yml to ensure you only have shows you want
* `autocr get` will download everything AFTER the currently watched episode. If you want to download the entire show, use `crunchy` until some form of `autocr all` is developed
