
const config = require('../config');
const basicAuth = require('express-basic-auth');

function requireRole(roles = {
  general: true,
  broadcaster: false,
  admin: false
}) {
  const credentials = [];
  if (roles.general) {
    credentials.push(config.CREDENTIALS.GENERAL);
  }
  if (roles.broadcaster) {
    credentials.push(config.CREDENTIALS.BROADCASTER);
  }
  if (roles.admin) {
    credentials.push(config.CREDENTIALS.ADMIN);
  }

  return basicAuth({
    challenge: true,
    users: Object.assign({}, ...credentials)
  });
}

module.exports = {
  requireRole
};
