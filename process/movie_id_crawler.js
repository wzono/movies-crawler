const dbConfig = require("../config/db");
const { BASE_URL, TAGS, NODE_API } = require("../config/default");
const Async = require("async");
const mysql = require("mysql2/promise");
const request = require("request-promise");
const getUserAgent = require("../utils/get_user_agent");
const getOne = require("../utils/get_one");
const random = require("../utils/random");
const shuffle = require("../utils/shuffle");
const pThrottle = require("p-throttle");

let ssrNodeIds = []; // 代理池
let cralwerUrls = {}; // 分类爬取页面

function createCralwerUrls() {
  return TAGS.reduce((acc, tag) => {
    const cralwerUrl = BASE_URL + "&genres=" + encodeURIComponent(tag);
    acc[tag] = cralwerUrl;
    return acc;
  }, {});
}

function createProxyTable(connection) {
  return connection.execute(
    "CREATE TABLE if not exists movie_ids(id char(15), title varchar(10), primary key(id))"
  );
}

function insertMovieIds(connection, data = []) {
  return connection.query(
    "INSERT ignore INTO `movie_ids` (id, title) VALUES ?",
    [data]
  );
}

function getMovieData(url, tag, start) {
  return new Promise(async (resolve, reject) => {
    request({
      url,
      proxy: "http://127.0.0.1:1087",
      headers: {
        userAgent: getUserAgent()
      },
      method: "GET",
      timeout: 8000
    })
      .then(res => {
        const response = JSON.parse(res);
        if (response.r === 1) {
          throw new Error(response.msg);
        }
        const data = response.data || [];
        const movieData = data.map(({ id, title }) => ({ id, title }));
        resolve(movieData);
      })
      .catch(err => {
        const rejectFunc = () =>
          reject(`[失败]: ${tag} start = ${start} | ${err.message}`);
        const toggle = pThrottle(toggleSSRNode, 1, 2000);
        toggle(getRandomSSRNode())
          .then(rejectFunc)
          .catch(rejectFunc);
      });
  });
}

function handleMovieDataFormat(data) {
  return data.map(({ id, title }) => [id, title]);
}

function runWithTag(connection, tag) {
  return new Promise(resolve => {
    let start = 0;
    let count = 0;
    let isOver = false;
    const movieQueue = Async.queue((url, callback) => {
      getMovieData(url + `&start=${start}`, tag, start, count)
        .then(data => {
          if (data.length === 0 || count > 3000) {
            return (isOver = true);
          }
          start += 80;
          count += data.length;
          console.log(
            `[${new Date().toLocaleTimeString()}][${tag}]: 已成功获取 ${count} 条数据`
          );
          insertMovieIds(connection, handleMovieDataFormat(data));
        })
        .catch(console.error)
        .finally(async () => {
          if (!isOver) {
            movieQueue.push(url);
          }
          setTimeout(callback, random(500, 2000)); // 控制请求频率
        });
    }, 1);

    movieQueue.push(cralwerUrls[tag]);
    movieQueue.drain(function() {
      resolve(count);
    });
  });
}

function run(connection) {
  return new Promise(resolve => {
    const stat = {};
    const tagsQueue = Async.queue((tag, callback) => {
      console.log(`[${tag}]: 开始爬取`);
      runWithTag(connection, tag).then(count => {
        stat[tag] = count;
        console.log(`[${tag}]: ${count}`);
        callback();
      });
    }, 2);

    tagsQueue.push(shuffle(TAGS));
    tagsQueue.drain(function() {
      resolve(stat);
    });
  });
}

// function getProxy() {
//   // return new Promise(resolve => {
//   //   request({
//   //     url: "https://ip.jiangxianli.com/api/proxy_ip",
//   //     method: "GET"
//   //   })
//   //     .then(response => {
//   //       const data = JSON.parse(response).data || {};
//   //       resolve(`${data.protocol}://${data.ip}:${data.port}`);
//   //     })
//   //     .catch(error => {
//   //       resolve(getOne(proxyUrls));
//   //     });
//   // });
//   index = index % proxyUrls.length;
//   return proxyUrls[index++];
// }

function getRandomSSRNode() {
  return getOne(ssrNodeIds);
}

// async function fetchProxies(connection) {
//   const [proxiesUsable] = await getProxyUrls(connection);
//   proxyUrls = proxiesUsable.map(
//     proxy => `${proxy.type}://${proxy.ip}:${proxy.port}`
//   );
// }

// function loopUpdateProxy() {
//   setTimeout(async () => {
//     if (isOver) return;
//     await fetchProxies();
//     loopUpdateProxy();
//   }, 1000 * 60 * 2);
// }

function getSSRNodeIds() {
  return new Promise(resolve => {
    request({
      url: NODE_API + "/servers",
      method: "GET"
    }).then(response => {
      const data = JSON.parse(response) || [];
      resolve(data.map(({ Id }) => Id));
    });
  });
}

function toggleSSRNode(nodeId) {
  return request({
    url: NODE_API + "/current",
    method: "put",
    form: { Id: nodeId }
  });
}

async function main() {
  const connection = await mysql.createConnection(dbConfig);
  try {
    await createProxyTable(connection);
    cralwerUrls = createCralwerUrls();
    ssrNodeIds = await getSSRNodeIds();
    // await fetchProxies(connection);
    // loopUpdateProxy();
    const stat = await run(connection);
    console.log(stat);
  } catch (err) {
    console.error(err);
  } finally {
    connection.end();
  }
}

main();
