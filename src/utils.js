const fs = require('fs');

// A map function that allows map to have asynchronous functions
Array.prototype.syncMap = async function (fn) {
  let arr = [];
  for(let i = 0; i < this.length; i++) {
    try {
      arr.push(await fn(this[i]));
    } catch (e) {
      arr.push(undefined);
    }
  }
  return arr;
};

// Create a directory if it does not already exist
function mkdir(dir) {
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
  }
}

// Format seconds into a countdown clock string (3d 02h 01m)
function countdown(secs) {
  const pad = t => t < 10 ? '0' + t : t;
  return `${Math.floor(secs / 60 / 60 / 24)}d ${pad(Math.floor(secs / 60 / 60) % 24)}h ${pad(Math.floor(secs / 60) % 60)}m`;
}

// Enable/disable console.log/process.stdout.write
const log = console.log.bind(console);
const writeBackup = process.stdout.write.bind(process.stdout);
function setQuiet(enabled) {
  const none = () => {};
  console.log = enabled ? none : log;
  process.stdout.write = enabled ? none : writeBackup;
}

module.exports = {
  mkdir, log, setQuiet, countdown
};
