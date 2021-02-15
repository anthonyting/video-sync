const general_username = process.env.general_username;
const general_password = process.env.general_password;

const admin_username = process.env.admin_username;
const admin_password = process.env.admin_password;

const session_secret = process.env.session_secret;

const BASEURL = process.env.BASEURL;
const SITE_URL = process.env.SITE_URL;
const PLEX_IP = process.env.PLEX_IP;
const PLEX_TOKEN = process.env.PLEX_TOKEN;

if ([general_username, general_password, admin_username, admin_password, session_secret, BASEURL, SITE_URL, PLEX_IP, PLEX_TOKEN].includes(undefined)) {
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
  session_secret,
  BASEURL,
  SITE_URL,
  PLEX_IP,
  PLEX_TOKEN
}
