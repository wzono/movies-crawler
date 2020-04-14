const { getMovieComments } = require("../service");
const dbConfig = require("../config/db");
const Async = require("async");
const mysql = require("mysql2/promise");
const request = require("request-promise");
const { NODE_API } = require("../config/default");
const process = require("process");
const {
  getUserAgent,
  getRandomString,
  genWhere,
  isIPaborted,
  getOne,
  shuffle,
  random
} = require("../utils/utils.js");
const pThrottle = require("p-throttle");
const cheerio = require("cheerio");
const { BasicParser, IMDbParser, IMDbCommentsParser } = require("../utils/parser");
const redis = require("redis");
const { promisify } = require("util");
const Crawler = require("crawler");
const client = redis.createClient();
const storeErrorIdAsync = promisify(client.sadd).bind(client);
const getErrorIdAsync = promisify(client.smembers).bind(client);

const errorDoubanIdRedisKey = "errorDoubanIds";
let connection = null;
let ssrNodeIds = [];
let ids = [];
const appKey = "UU90YjAyYmpmQkJ0d0J4MjpEdUF5cGQxbjE2QXNabXhQ";

let togglePromise = null;

function getRandomSSRNode() {
  return getOne(ssrNodeIds);
}

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
  }).finally(() => {
    togglePromise = null
  })
}

const toggle = (id) => {
  if (togglePromise) {
    return togglePromise
  }
  togglePromise = toggleSSRNode(id)
  return togglePromise
};

function getErrorDoubanIds() {
  return getErrorIdAsync(errorDoubanIdRedisKey);
}

function storeErrorDoubanId(errorId) {
  return storeErrorIdAsync(errorDoubanIdRedisKey, errorId);
}

function getDoubanIds() {
  return new Promise(async (resolve, reject) => {
    try {
      const [values] = await connection.query(
        "select * from  movie_ids where (select count(1) as num from movies where movies.douban_id = movie_ids.douban_id) = 0"
      );
      resolve(values.map(({ douban_id }) => douban_id));
    } catch (err) {
      reject(err);
    }
  });
}

function getUrl(doubanId) {
  return `https://movie.douban.com/subject/${doubanId}`;
}

/**
 *
 * @param {String} table
 * @param {Object} data  {} key-value
 */
function insert(table, data = {}, needQuery = true) {
  return new Promise(async (resolve, reject) => {
    let returnValue = "";
    try {
      await connection.query(`INSERT IGNORE INTO ${table} set ?`, [data]);
      if (needQuery) {
        returnValue = await getInsertData(table, data);
      }
      resolve(returnValue);
    } catch (err) {
      reject(err);
    }
  });
}

function getInsertData(table, dataObj = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const where = genWhere(dataObj);
      const [values] = await connection.query(
        `SELECT * FROM ${table} where ${where}`
      );
      resolve(values[values.length - 1] || {});
    } catch (err) {
      reject(err);
    }
  });
}

function insertMovieBasicData(data) {
  return insert("movies", data);
}

function insertFilmMen(filmMen) {
  return new Promise(async (resolve, reject) => {
    try {
      const filmMenObject = filmMen.map(filmMan => ({ name: filmMan }));
      const data = await Promise.all(
        filmMenObject.map(filmMan => insert("film_men", filmMan))
      );
      resolve(data);
    } catch (err) {
      reject(err);
    }
  });
}

function insertFilmManMovieRelations(relations) {
  return new Promise(async (resolve, reject) => {
    try {
      await Promise.all(
        relations.map(relation =>
          insert("movie_film_man_role", relation, false)
        )
      );
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

function insertGenres(genres) {
  return new Promise(async (resolve, reject) => {
    try {
      const data = await Promise.all(
        genres.map(genre => insert("genres", { name: genre }))
      );
      resolve(data);
    } catch (err) {
      reject(err);
    }
  });
}

function insertMovieGenreRelations(relations) {
  return new Promise(async (resolve, reject) => {
    try {
      await Promise.all(
        relations.map(relation => insert("movie_genre", relation, false))
      );
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

function insertRegions(regions) {
  return new Promise(async (resolve, reject) => {
    try {
      const regionsObject = regions.map(region => ({ name: region }));
      const data = await Promise.all(
        regionsObject.map(region => insert("regions", region))
      );
      resolve(data);
    } catch (err) {
      reject(err);
    }
  });
}

function insertMovieRegionRelations(relations) {
  return new Promise(async (resolve, reject) => {
    try {
      await Promise.all(
        relations.map(relation => insert("movie_region", relation, false))
      );
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

function updateMovieBasicData(data, id) {
  return connection.query('update movies set ? where `imdb_id` = ?', [data, id])
}

async function handleDataStore(res, done) {
  const { doubanId } = res.options;
  const data = new BasicParser(res.$).data;
  const {
    directors = [],
    writers = [],
    actors = [],
    genres = [],
    regions = [],
    ...basicData
  } = {
    ...data,
    douban_id: doubanId
  };

  await connection.beginTransaction();
  try {
    if (!basicData.title) {
      throw new Error("no title");
    }
    const { id: dbMovieId } = await insertMovieBasicData(basicData);
    const dbRegions = await insertRegions(regions);
    await insertMovieRegionRelations(
      dbRegions.map(region => ({ movie_id: dbMovieId, region_id: region.id }))
    );
    const dbDirectors = await insertFilmMen(directors);
    await insertFilmManMovieRelations(
      dbDirectors.map(director => ({
        movie_id: dbMovieId,
        film_man_id: director.id,
        role_id: 1
      }))
    );
    const dbWriters = await insertFilmMen(writers);
    await insertFilmManMovieRelations(
      dbWriters.map(writer => ({
        movie_id: dbMovieId,
        film_man_id: writer.id,
        role_id: 2
      }))
    );
    const dbActors = await insertFilmMen(actors);
    await insertFilmManMovieRelations(
      dbActors.map(actor => ({
        movie_id: dbMovieId,
        film_man_id: actor.id,
        role_id: 3
      }))
    );
    const dbGenres = await insertGenres(genres);
    await insertMovieGenreRelations(
      dbGenres.map(genre => ({ movie_id: dbMovieId, genre_id: genre.id }))
    );
    await connection.commit();
    console.log(`[OK] ${basicData.title} ${doubanId}`);
  } catch (err) {
    await connection.rollback();
    console.log(`[FAIL] ${basicData.title}`);
    console.log(err);
    if (err.message === "no title") {
      toggle(getRandomSSRNode());
    }
  } finally {
    done();
  }
}

function basicInfoTask() {
  return new Promise(resolve => {
    const task = new Crawler({
      jQuery: "cheerio",
      proxy: "http://127.0.0.1:1087",
      jar: true,
      maxConnections: 10,
      retries: 0,
      callback: function (err, response, done) {
        const { doubanId } = response.options;
        if (err || isIPaborted(response.$)) {
          console.error(`[FAIL-START] ${doubanId}`);
          toggle(getRandomSSRNode())
            .then(done)
            .catch(done);
          // task.queue({ uri: getUrl(doubanId), doubanId });
        } else {
          handleDataStore(response, done);
        }
      }
    });

    task.queue(ids.map(id => ({ uri: getUrl(id), doubanId: id + "" })));

    task.on("schedule", function (options) {
      options.headers["User-Agent"] = getUserAgent();
      options.headers["Cookies"] = `bid=${getRandomString(11)}`;
    });

    task.on("drain", function () {
      resolve();
    });
  });
}

function getIMDbBasicData(id) {
  return new Promise((resolve, reject) => {
    request({
      uri: `https://www.imdb.com/title/${id}`,
      proxy: 'http://127.0.0.1:1087',
      timeout: 10000,
    }).then((res) => {
      const $ = cheerio.load(res)
      const data = new IMDbParser($).data
      resolve(data)
    }).catch(reject)
  })
}

function getIMDbReviews(id) {
  return new Promise((resolve, reject) => {
    request({
      uri: `https://www.imdb.com/title/${id}/reviews`,
      proxy: 'http://127.0.0.1:1087',
      timeout: 10000,
    }).then((res) => {
      const $ = cheerio.load(res)
      const data = new IMDbCommentsParser($).data
      resolve(data)
    }).catch(reject)
  })
}

function queryMovieIdByIMDbId(imdbId) {
  return new Promise(async (resolve, reject) => {
    try {
      const [data] = await connection.query('SELECT id from movies where imdb_id = ?', [imdbId])
      resolve((data[0] || {}).id)
    } catch (err) {
      throw err
    }
  })
}

function insertIMDbReviews(reviews = []) {
  return new Promise(async (resolve, reject) => {
    try {
      const data = await Promise.all(
        reviews.map(review => insert("reviews_imdb", review))
      );
      resolve(data);
    } catch (err) {
      reject(err);
    }
  });
}

function insertMovieIMDbReviewsRelations(relations) {
  return new Promise(async (resolve, reject) => {
    try {
      await Promise.all(
        relations.map(relation => insert("movie_review_imdb", relation, false))
      );
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}




function runIMDbTask(ids) {
  return new Promise((resolve) => {
    let count = 0;
    let total = ids.length;
    const movieQueue = Async.queue((id, callback) => {
      Promise.all([getIMDbBasicData(id), getIMDbReviews(id)]).then(async ([basicData, reviews]) => {
        try {
          await connection.beginTransaction()
          await updateMovieBasicData(basicData, id)
          const movieId = await queryMovieIdByIMDbId(id)
          const reviewsDb = await insertIMDbReviews(reviews)
          await insertMovieIMDbReviewsRelations(reviewsDb.map(review => ({ movie_id: movieId, review_id: review.id })))
          await connection.commit()
          count++;
          console.log(`[OK] ${id} ${count}/${total}`)
        } catch (err) {
          await connection.rollback()
          throw err
        }
      }).catch(err => {
        if (err.name === 'RequestError') {
          console.log(`[FAIL] ${id} 爬虫被检测，正在切换节点...`)
          movieQueue.push(id)
        } else {
          console.log(`[FAIL] ${id}`)
        }

        return toggle(getRandomSSRNode())
      }).finally(() => {
        setTimeout(callback, random(300, 800))
      })
    }, 10)

    movieQueue.push(ids)
    movieQueue.drain(function () {
      resolve();
    });

  })
}

function getIMDbIds() {
  return new Promise(async (resolve, reject) => {
    try {
      const [values] = await connection.query(
        "select imdb_id from movies where ISNULL(imdb_summary)"
      );
      resolve(values.map(({ imdb_id }) => imdb_id));
    } catch (err) {
      reject(err);
    }
  });
}

async function main() {
  try {
    connection = await mysql.createConnection(dbConfig);
    ssrNodeIds = await getSSRNodeIds();
    // ids = shuffle(await getDoubanIds());
    // await basicInfoTask();
    ids = shuffle(await getIMDbIds());
    await runIMDbTask(ids)
  } finally {
    connection.end();
    client.end(true);
  }
}

main();
