const net = require("net");

function isPortOccupied(port) {
  const server = net.createServer().listen(port, "localhost");
  return new Promise(resolve => {
    server.on("listening", () => {
      server.close();
      resolve(false);
    });

    server.on("error", err => {
      resolve(true);
    });
  });
}

module.exports = isPortOccupied;
