const { exec } = require("child_process");
const isPortOccupied = require("../utils/is_port_occupied.js");
function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

async function main() {
  let isProxyServerPortOccupied = false;
  while (true) {
    isProxyServerPortOccupied = await isPortOccupied(9528);
    if (!isProxyServerPortOccupied) {
      exec("open /Applications/SAPI.app");
    }
    await sleep(2000);
  }
}

main();
