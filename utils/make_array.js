module.exports = function makeArray(start = 0, end = 10, step = 1) {
  const arr = [];
  for (let i = start; i <= end; i += step) {
    arr.push(i);
  }
  return arr;
};
