const session = require('express-session');
const config = require('./config');
let sessionStore;

if (process.env.NODE_ENV !== 'production') {
  const MemoryStore = require('memorystore')(session)
  console.log("Setting up memory session store");
  sessionStore = new MemoryStore({
    checkPeriod: 24 * 60 * 60 * 1000
  });
} else {
  const redis = require('redis');
  const RedisStore = require('connect-redis')(session);
  const redisClient = redis.createClient();
  console.log("Setting up redis session store");
  sessionStore = new RedisStore({
    client: redisClient
  });
}

const sessionParser = session({
  cookie: {
    maxAge: 86400000
  },
  store: sessionStore,
  secret: config.session_secret,
  resave: false,
  saveUninitialized: false
});

module.exports = sessionParser
