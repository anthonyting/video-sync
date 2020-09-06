const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const config = require('./config');

const sessionParser = session({
  cookie: {
    maxAge: 86400000
  },
  store: new MemoryStore({
    checkPeriod: 86400000 // prune expired entries every 24h
  }),
  secret: config.session_secret,
  resave: false,
  saveUninitialized: false
});

module.exports = sessionParser