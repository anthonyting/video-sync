const PQueue = require('p-queue').default;
const queue = new PQueue({
  concurrency: 1
});
const config = require('../config');

let count = 0;
queue.on('active', () => {
  console.log(`Working on item #${++count}. Size: ${queue.size} Pending: ${queue.pending}.`);
});

module.exports = queue;
