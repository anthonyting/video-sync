var express = require('express');
var router = express.Router();

const config = require('../config');
const basicAuth = require('express-basic-auth');

const clients = require("../app").clients;
const createHttpError = require('http-errors');

/* GET home page. */
router.get('/', basicAuth({
  users: Object.assign({}, config.credentials.general, config.credentials.admin),
  challenge: true
}), function (req, res, next) {
  req.session.hasAccess = true;

  res.render('receive', {
    title: 'secret'
  });
});

router.get('/broadcast', basicAuth({
  users: config.credentials.admin,
  challenge: true
}), (req, res, next) => {
  req.session.hasStreamAccess = true;
  req.session.hasAccess = true;

  res.render('broadcast', {
    title: 'admin_page'
  });
});

router.get('/monitor', basicAuth({
  users: config.credentials.admin,
  challenge: true
}), (req, res, next) => {
  res.render('monitor', {
    title: 'monitor',
    clients: clients
  });
});

router.post('/terminate/:id', (req, res, next) => {
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
            value.socket.close(1008, "Terminated");
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

router.use('/library', basicAuth({
  users: config.credentials.admin,
  challenge: true
}), require('./library'));

module.exports = router;
