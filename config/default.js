module.exports = {
  TAGS: [
    "剧情",
    "喜剧",
    "动作",
    "爱情",
    "科幻",
    "动画",
    "悬疑",
    "惊悚",
    "恐怖",
    "犯罪",
    "同性",
    "音乐",
    "歌舞",
    "传记",
    "历史",
    "战争",
    "西部",
    "奇幻",
    "冒险",
    "灾难",
    "武侠",
    "情色"
  ],
  BASE_URL: `https://movie.douban.com/j/new_search_subjects?sort=U&range=0,10&limit=80&tags=${encodeURIComponent(
    "电影"
  )}`,
  // PROXY_URL: "https://www.kuaidaili.com/free/inha/",
  PROXY_URL: "https://ip.jiangxianli.com/api/proxy_ips",
  NODE_API: "http://localhost:9528"
};
