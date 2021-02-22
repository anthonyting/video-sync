const session = require('express-session');

const RedisStore = require('connect-redis')(session);
const config = require('./config');
let sessionStore= new RedisStore({
  client: redis
});
const redis = require('./src/redis');
console.log("Setting up redis session store");
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
