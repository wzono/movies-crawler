const Request = require("request-promise");
const { DOUBAN_API, API_KEY } = require("../config/default");
const { getUserAgent } = require("../utils/utils.js");

const request = Request.defaults({
  baseUrl: DOUBAN_API,
  qs: { apikey: API_KEY, start: 0, count: 100 },
  json: true,
  proxy: "http://127.0.0.1:1087"
});

function getMovieComments(id) {
  return request({
    url: `/subject/${id}/comments`,
    headers: {
      userAgent: getUserAgent()
    }
  });
}

function getMoviwReviews(id) {
  return request({
    url: `/subject/${id}/reviews`,
    headers: {
      userAgent: getUserAgent()
    }
  });
}

module.exports = {
  getMoviwReviews,
  getMovieComments
};
