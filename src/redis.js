const config = require('../config');
const redis = require('redis');
const redisClient = redis.createClient(config.REDIS_URL);

module.exports = redisClient;
