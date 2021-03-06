var express = require('express');
var router = express.Router();

const config = require('../config');
const clients = require("../app").clients;
const createHttpError = require('http-errors');
const redis = require('../src/redis');
const {
  requireRole
} = require('../util');

/* GET home page. */
router.get('/', requireRole({
  general: true,
  broadcaster: true,
  admin: true
}), (req, res, next) => {
  req.session.hasAccess = true;
  redis.get(config.CONTENT_KEY, (err, reply) => {
    if (err) {
      next(err);
    } else {
      res.render('receive', {
        title: 'secret',
        CONTENT: reply,
        CONTENT_BASE_URL: CONTENT_BASE_URL
      });
    }
  });
});

router.get('/broadcast', requireRole({
  broadcaster: true,
  admin: true
}), (req, res, next) => {
  req.session.hasStreamAccess = true;
  req.session.hasAccess = true;
  redis.get(config.CONTENT_KEY, (err, reply) => {
    if (err) {
      next(err);
    } else {
      res.render('broadcast', {
        title: 'admin_page',
        CONTENT: reply,
        CONTENT_BASE_URL: CONTENT_BASE_URL
      });
    }
  });
});

router.get('/monitor', requireRole({
  admin: true
}), (req, res, next) => {
  res.render('monitor', {
    title: 'monitor',
    clients: clients
  });
});

router.post('/terminate/:id', requireRole({
  admin: true
}), (req, res, next) => {
  res.locals.jsonError = true;

  if (req.session.hasStreamAccess) {
    const id = req.params.id;
    if (id) {
      const clientSessions = clients.get(id);
      if (!clientSessions) {
        return next(createHttpError(400));
      }

      const terminatePromises = [];
      clientSessions.forEach(value => {
        value.socket.send(JSON.stringify({
          type: 'terminate',
          timestamp: Date.now()
        }));
        terminatePromises.push(new Promise(resolve => {
          setTimeout(() => {
            if (value.socket) {
              value.socket.close(1008, "Terminated");
            }
            resolve();
          }, 1000);
        }));
      });

      Promise.all(terminatePromises)
        .then(() => {
          clients.delete(id);
          res.end();
        })
        .catch(next);
    } else {
      next(createHttpError(400));
    }
  } else {
    next(createHttpError(401));
  }
});

router.use('/library', require('./library'));

module.exports = router;
