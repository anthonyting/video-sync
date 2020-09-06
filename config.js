const general_username = process.env.general_username;
const general_password = process.env.general_password;

const admin_username = process.env.admin_username;
const admin_password = process.env.admin_password;

const session_secret = process.env.session_secret;

if ([general_username, general_password, admin_username, admin_password, session_secret].includes(undefined)) {
  console.warn("Some environment variables are undefined.");
}

const general = {};
general[general_username] = general_password;

const admin = {};
admin[admin_username] = admin_password;

module.exports = {
  credentials: {
    general: general,
    admin: admin
  },
  session_secret
}