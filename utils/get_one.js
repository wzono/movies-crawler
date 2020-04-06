module.exports = function getOne(array) {
  return array[parseInt(Math.random() * array.length, 10)];
};
