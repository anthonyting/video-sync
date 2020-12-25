var express = require('express');
var router = express.Router();

const config = require('../config');
const basicAuth = require('express-basic-auth');

const clients = require("../app").clients;

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

module.exports = router;
