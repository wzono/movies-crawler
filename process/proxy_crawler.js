const config = require("../config/default");
const dbConfig = require("../config/db");
const makeArray = require("../utils/make_array");
const getUserAgent = require("../utils/get_user_agent");
const url = require("url");
const Crawler = require("crawler");
const Async = require("async");
const mysql = require("mysql2/promise");
const request = require("request-promise");

const { PROXY_URL } = config;

function createCralwerUrls() {
  return makeArray(1, 20).map(page => {
    const cralwerUrl = url.resolve(PROXY_URL, `${page}`);
    return cralwerUrl;
  });
}

function createProxyTable(connection) {
  return connection.execute(
    "CREATE TABLE if not exists proxy(ip char(15), port char(15), type char(15))"
  );
}

function insertProxyUrls(connection, data = []) {
  return connection.query(
    "INSERT ignore INTO `proxy` (ip, port, type) VALUES ?",
    [data]
  );
}

function getProxyUrls(connection) {
  return connection.query("select * from proxy");
}

function deleteProxyUrl(connection, ip) {
  return connection.execute("delete from proxy where ip = ?", [ip]);
}

function resolvePageData($) {
  return $("#list tr")
    .slice(1)
    .map(function(index, element) {
      const td = $(element).children("td");
      return {
        ip: td[0].children[0].data,
        port: td[1].children[0].data,
        type: td[3].children[0].data.toLowerCase()
      };
    })
    .get();
}

function formatSQLParams(data = []) {
  return data.map(({ ip, port, type }) => [ip, port, type]);
}

async function handleProxyUrl(connection, { res, done }) {
  const formatData = formatSQLParams(resolvePageData(res.$));
  if (formatData.length === 0) {
    return done();
  }
  insertProxyUrls(connection, formatData)
    .catch(err => console.error(err.message))
    .finally(done);
}

function checkProxyUrlAvailable(proxy) {
  return new Promise((resolve, reject) => {
    request({
      url: "http://apps.bdimg.com/libs/jquery/2.1.4/jquery.min.js",
      proxy: `${proxy.type}://${proxy.ip}:${proxy.port}`,
      method: "GET",
      timeout: 5000,
      headers: {
        userAgent: getUserAgent()
      }
    })
      .then(() => {
        console.log(`[有效]: ${proxy.ip}`);
        resolve();
      })
      .catch(async () => {
        console.log(`[无效]: ${proxy.ip}`);
        reject();
      });
  });
}

function checkProxyUrlsAvailable(connection, proxies) {
  return new Promise(async resolve => {
    const checkQueue = Async.queue(function(proxy, callback) {
      checkProxyUrlAvailable(proxy)
        .catch(async () => {
          await deleteProxyUrl(connection, proxy.ip);
        })
        .finally(callback);
    }, 20);

    checkQueue.push(proxies);

    checkQueue.drain(function() {
      resolve();
    });
  });
}

function run(connection) {
  return new Promise(async function(resolve) {
    const crawlerUrls = createCralwerUrls();
    const crawler = new Crawler({
      userAgent: getUserAgent(),
      maxConnections: 10,
      jQuery: "cheerio",
      callback(error, res, done) {
        if (error) {
          return console.error(error);
        }
        handleProxyUrl(connection, { res, done });
      }
    });
    crawler.queue(crawlerUrls);
    crawler.on("drain", function() {
      resolve();
    });
  });
}

function check(connection) {
  return new Promise(async function(resolve) {
    const [proxies] = await getProxyUrls(connection);
    await checkProxyUrlsAvailable(connection, proxies);
    resolve();
  });
}

async function main() {
  const connection = await mysql.createConnection(dbConfig);
  const res = await createProxyTable(connection);
  await run(connection);
  await check(connection);
  connection.end();
}

main();
