const GENERAL_USERNAME = process.env.GENERAL_USERNAME;
const GENERAL_PASSWORD = process.env.GENERAL_PASSWORD;

const BROADCASTER_USERNAME = process.env.BROADCASTER_USERNAME;
const BROADCASTER_PASSWORD = process.env.BROADCASTER_PASSWORD;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const SESSION_SECRET = process.env.session_secret;

const BASEURL = process.env.BASEURL;
const SITE_URL = process.env.SITE_URL;
const PLEX_IP = process.env.PLEX_IP;
const PLEX_TOKEN = process.env.PLEX_TOKEN;

const FFMPEG_OUTPUT_PATH = process.env.FFMPEG_OUTPUT_PATH;

/** @type {Array<string>} */
const CONTENT_INPUT_PATHS = JSON.parse(process.env.CONTENT_INPUT_PATHS);
/** @type {Array<string>} */
const ORIGINAL_INPUT_PATHS = JSON.parse(process.env.ORIGINAL_INPUT_PATHS);

const CONTENT_KEY = "CONTENT_KEY";

const REDIS_URL = process.env.REDIS_URL;

const GENERAL = {};
GENERAL[GENERAL_USERNAME] = GENERAL_PASSWORD;

const ADMIN = {};
ADMIN[ADMIN_USERNAME] = ADMIN_PASSWORD;

const BROADCASTER = {};
BROADCASTER[BROADCASTER_USERNAME] = BROADCASTER_PASSWORD;

const CONTENT_BASE_URL = process.env.CONTENT_BASE_URL;

const config = {
  CREDENTIALS: {
    GENERAL: GENERAL,
    ADMIN: ADMIN,
    BROADCASTER: BROADCASTER
  },
  SESSION_SECRET,
  BASEURL,
  SITE_URL,
  PLEX_IP,
  PLEX_TOKEN,
  CONTENT_INPUT_PATHS,
  ORIGINAL_INPUT_PATHS,
  FFMPEG_OUTPUT_PATH,
  CONTENT_KEY,
  REDIS_URL,
  CONTENT_BASE_URL
};

for (const element in config) {
  if (!config[element]) {
    throw new Error(`Missing config option for: ${element}`);
  }
}

module.exports = config;
