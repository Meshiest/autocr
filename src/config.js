const os = require('os');
const yaml = require('js-yaml');
const fs = require('fs');
const { mkdir } = require('./utils.js');

const HOME_PATH = os.homedir() + '/.autocr.yml';
const CONFIG_PATH = fs.existsSync(HOME_PATH) ? HOME_PATH : 'config.yml';

// Write an object to the yml config file
function writeConfig(obj, isNew, useHome) {
  if(isNew)
    log('Creating config file:', useHome ? HOME_PATH : CONFIG_PATH);
  fs.writeFileSync(useHome ? HOME_PATH : CONFIG_PATH, yaml.safeDump(obj));
}


// Load config file
let config = fs.existsSync(CONFIG_PATH) && yaml.safeLoad(fs.readFileSync(CONFIG_PATH, 'utf8')) ||
  fs.existsSync(HOME_PATH) && yaml.safeLoad(fs.readFileSync(HOME_PATH, 'utf8'));

config && mkdir(config.settings.output_dir);

module.exports = {
  config,
  writeConfig,
};