const dateFormat = require("dateformat");
const monthMap = {
  "January": '01',
  "February": '02',
  "March": '03',
  "April": '04',
  "May": '05',
  "June": '06',
  "July": '07',
  "August": '08',
  "September": '09',
  "October": '10',
  "November": '11',
  "December": '12'
}
function has(origin, str) {
  return origin.toLowerCase().indexOf(str.toLowerCase()) !== -1;
}

function getLabelText(label) {
  return !!~label.indexOf(":") ? label.slice(0, -1) : label;
}

class BasicParser {
  constructor($) {
    this.$ = $;
    this.data = this.getMovieBasicData();
  }

  getMovieBasicData() {
    return {
      ...this.getMovieTitle(),
      ...this.getMovieYear(),
      ...this.getMovieCover(),
      ...this.getMovieInfo(),
      ...this.getMovieRatingFromDouban(),
      ...this.getMovieSummaryFromDouban()
    };
  }

  getMovieTitle() {
    const wholeTitle = this.$(
      "#content > h1 > span[property='v:itemreviewed']"
    ).text();
    const title = this.$("#comments-section .mod-hd h2 i")
      .text()
      .slice(0, -3);

    const origin_title = wholeTitle
      .split(title)
      .join("")
      .trim();
    return { title, origin_title };
  }

  getMovieYear() {
    return {
      pub_year: this.$("#content > h1 > .year")
        .text()
        .slice(1, -1)
    };
  }

  getMovieInfo() {
    const $ = this.$;
    const handlers = {
      导演: {
        prop: "directors",
        handle: ele =>
          $(ele)
            .nextAll(".attrs")
            .eq(0)
            .find("a[rel='v:directedBy']")
            .map(function () {
              return $(this).text();
            })
            .get()
      },
      编剧: {
        prop: "writers",
        handle: ele =>
          $(ele)
            .nextAll(".attrs")
            .eq(0)
            .find("a")
            .map(function () {
              return $(this).text();
            })
            .get()
      },
      主演: {
        prop: "actors",
        handle: ele =>
          $(ele)
            .nextAll(".attrs")
            .eq(0)
            .find("a[rel='v:starring']")
            .map(function () {
              return $(this).text();
            })
            .get()
      },
      类型: {
        prop: "genres",
        handle: ele =>
          $(ele)
            .nextAll("span[property='v:genre']")
            .map(function () {
              return $(this).text();
            })
            .get()
      },
      "制片国家/地区": {
        prop: "regions",
        handle: ele =>
          (ele.nextSibling.data || "")
            .trim()
            .split("/")
            .filter(s => s)
            .map(s => s.trim())
      },
      上映日期: {
        prop: "release_date",
        handle: ele =>
          dateFormat(
            new Date(
              $(ele)
                .next("span[property='v:initialReleaseDate']")
                .attr("content")
                .slice(0, 10)
            ),
            "yyyy-mm-dd"
          )
      },
      片长: {
        prop: "duration",
        handle: ele =>
          +$(ele)
            .next("span[property='v:runtime']")
            .attr("content") || parseInt((ele.nextSibling.data || "").trim())
      },
      又名: {
        prop: "alias",
        handle: ele =>
          (ele.nextSibling.data || "")
            .trim()
            .split("/")
            .filter(s => s)
            .map(s => s.trim())
            .join(",")
      },
      IMDb链接: {
        prop: "imdb_id",
        handle: ele =>
          $(ele)
            .next("a")
            .text()
      },
      语言: {
        prop: "lang",
        handle: ele =>
          (ele.nextSibling.data || "")
            .trim()
            .split("/")
            .filter(s => s)
            .map(s => s.trim())
            .join(",")
      }
    };

    const infoLabelNodes = $("#content #info").find(".pl") || [];

    return infoLabelNodes
      .filter(function (i) {
        const label = getLabelText($(this).text());
        return handlers[label];
      })
      .map(function (i, ele) {
        const label = getLabelText($(this).text());
        const handler = handlers[label];
        return {
          [handler.prop]: handler.handle(ele)
        };
      })
      .get()
      .reduce((acc, cur) => {
        return {
          ...acc,
          ...cur
        };
      }, {});
  }
  getMovieRatingFromDouban() {
    const $ = this.$;
    const votesNode = $("#interest_sectl span[property='v:votes']");

    return {
      douban_rating: +$("#interest_sectl .rating_num").text(),
      douban_rating_count: +votesNode.text() || 0,
      douban_star_count:
        +($("#interest_sectl .bigstar").attr("class") || "").slice(-2) / 10
    };
  }

  getMovieCover() {
    return { cover: this.$("#mainpic .nbgnbg img").attr("src") };
  }

  getMovieSummaryFromDouban() {
    const summaryAll = this.$("#link-report .all");
    return {
      douban_summary: formatSummary(
        summaryAll.text() ||
        this.$("#link-report span[property='v:summary']").text()
      )
    };
  }
}

class IMDbParser {
  constructor($) {
    this.$ = $;
    this.data = this.getIMDbData()
  }

  getIMDbData() {
    return {
      ...this.getMovieRatingAndDuration(),
      ...this.getSummary(),
      ...this.getReleaseDate(),
    }
  }

  getMovieRatingAndDuration() {
    const { $ } = this
    const data = JSON.parse($('script[type="application/ld+json"]').html())
    const ratingObject = data.aggregateRating || {}
    return {
      imdb_rating: +ratingObject.ratingValue || 0,
      imdb_rating_count: +ratingObject.ratingCount || 0,
      duration: resolveDuration(data.duration)
    }
  }

  getSummary() {
    const { $ } = this
    return {
      imdb_summary: ($('#title-overview-widget .summary_text').text().split("See full summary »").join("") || "").trim()
    }
  }

  getReleaseDate() {
    const { $ } = this
    const detailItems = $('#titleDetails').find('h4') || []
    const date = detailItems.filter(function (i, ele) {
      const label = getLabelText($(this).text()).toLowerCase()
      return label === 'release date'
    }).map(function (i, ele) {
      return resolveReleaseDate(ele.nextSibling.data || "")
    }).get()[0]
    return {
      release_date: date
    }
  }
}

class IMDbCommentsParser {
  constructor($) {
    this.$ = $;
    this.data = this.getData()
  }

  getData() {
    const { $ } = this
    const list = $('#main .lister-list').find('.imdb-user-review') || []

    return list.map(function (i, ele) {
      const rating = +(($(this).find('.rating-other-user-rating .point-scale').eq(0).prev().text() || "").split(",").join(""))
      const title = $(this).find('a.title').eq(0).text() || ""
      const author = $(this).find('.display-name-link a').eq(0).text() || ''
      const created_at = resolveReleaseDate(($(this).find('.display-name-date .review-date').eq(0).text() || ""))

      const content = formatSummary($(this).find('.content').eq(0).text() || "")
      const useful_count = +(($(this).find('.actions').eq(0).text().trim() || "").split(" ")[0].split(",").join(""))
      return {
        rating, title, author, created_at, content, useful_count
      }
    }).get()
  }
}

function formatSummary(summary) {
  return summary
    .split("\n")
    .map(s => s.trim())
    .filter(s => s)
    .join("\n");
}

function resolveReleaseDate(dateStr) {
  const quoteIndex = dateStr.indexOf('(')
  const hasQuote = quoteIndex !== -1;
  const s = (hasQuote ? dateStr.slice(0, quoteIndex) : dateStr).trim();
  const dates = s.split(" ");
  if (dates.length === 1) {
    return `${dates[0]}-01-01`
  }
  if (dates.length === 2) {
    const [month, year] = dates;
    return `${year}-${monthMap[month]}-01`
  }

  const [day, month, year] = dates;

  return `${year}-${monthMap[month]}-${day.length < 2 ? '0' + day : day}`
}

function resolveDuration(ds = '') {
  if (!ds) {
    return 0
  }
  const dsLower = ds.toLowerCase()
  const dst = ~dsLower.indexOf('pt') ? dsLower.slice(2) : dsLower
  const hm = dst.split('h').join(',').split('m').join('').split(',')
  return hm.length === 2 ? Number(hm[0]) * 60 + Number(hm[1]) : Number(hm[0])
}

module.exports = {
  BasicParser,
  IMDbParser,
  IMDbCommentsParser
};
