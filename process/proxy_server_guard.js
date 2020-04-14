const { exec } = require("child_process");
const { isPortOccupied } = require("../utils/utils.js");

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

function restart() {
  return new Promise(resolve => {
    exec("kill `ps -ef | grep SAPI | grep -v grep | awk '{print $2}'`", function () {
      exec("open /Applications/SAPI.app", function (err) {
        console.log(err)
        resolve()
      });
    })
  })
}

async function main() {
  let isProxyServerPortOccupied = false;

  while (true) {
    isProxyServerPortOccupied = await isPortOccupied(9528);
    if (!isProxyServerPortOccupied) {
      await restart()
    }
    console.log(isProxyServerPortOccupied);
    await sleep(2000);
  }
}

main();
