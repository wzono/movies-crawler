const charset = require("superagent-charset");
const superagent = require("superagent");
const request = charset(superagent);

require("superagent-proxy")(request);
// require("superagent-retry")(superagent);

module.exports = request;
