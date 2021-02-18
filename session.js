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
  const redis = require('./src/redis');
  const RedisStore = require('connect-redis')(session);
  console.log("Setting up redis session store");
  sessionStore = new RedisStore({
    client: redis
  });
}

const sessionParser = session({
  cookie: {
    maxAge: 86400000
  },
  store: sessionStore,
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
});

module.exports = sessionParser
