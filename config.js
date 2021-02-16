const general_username = process.env.general_username;
const general_password = process.env.general_password;

const admin_username = process.env.admin_username;
const admin_password = process.env.admin_password;

const session_secret = process.env.session_secret;

const BASEURL = process.env.BASEURL;
const SITE_URL = process.env.SITE_URL;
const PLEX_IP = process.env.PLEX_IP;
const PLEX_TOKEN = process.env.PLEX_TOKEN;

const FFMPEG_OUTPUT_PATH = process.env.FFMPEG_OUTPUT_PATH;

/** @type {Array<string>} */
const CONTENT_INPUT_PATHS = JSON.parse(process.env.CONTENT_INPUT_PATHS);
/** @type {Array<string>} */
const ORIGINAL_INPUT_PATHS = JSON.parse(process.env.ORIGINAL_INPUT_PATHS);

if ([
    general_username,
    general_password,
    admin_username,
    admin_password,
    session_secret,
    BASEURL,
    SITE_URL,
    PLEX_IP,
    PLEX_TOKEN,
    FFMPEG_OUTPUT_PATH,
    CONTENT_INPUT_PATHS,
    ORIGINAL_INPUT_PATHS
  ].includes(undefined)) {
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
  PLEX_TOKEN,
  CONTENT_INPUT_PATHS,
  ORIGINAL_INPUT_PATHS,
  FFMPEG_OUTPUT_PATH
}
