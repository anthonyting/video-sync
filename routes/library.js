const fetch = require('node-fetch').default;
const config = require("../config");
const router = require('express').Router();
const url = require('url');
const createHttpError = require('http-errors');
const ffmpeg = require('ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const queue = require('../src/queue');
const clients = require('../app').clients;
const MessageTypes = require('../src/constants').MessageTypes;

/**
 * @param {string} route
 * @param {?import('url').URLSearchParams} params 
 * @param {import('node-fetch').RequestInit} fetchBody
 */
async function queryPlex(route, params = new url.URLSearchParams(), fetchBody = {}) {
  const plex = new url.URL(config.PLEX_IP + route);
  params.append('X-Plex-Token', config.PLEX_TOKEN);
  plex.search = params;

  const request = await fetch(plex, Object.assign(fetchBody, {
    headers: {
      'Accept': 'application/json'
    }
  }));

  if (!request.ok) {
    return await request.json();
  }

  return (await request.json()).MediaContainer
}

router.get('/', (req, res, next) => {
  res.render('library');
});

/**
 * 
 * @param {string} filepath 
 * @returns {Promise<?string>}
 */
async function findRealPath(filepath) {
  const check = [];
  for (originalPath of config.ORIGINAL_INPUT_PATHS) {
    const relative = path.win32.relative(originalPath, filepath).split(path.win32.sep).join(path.posix.sep);
    if (relative.length < filepath.length) {
      for (contentPath of config.CONTENT_INPUT_PATHS) {
        const newPath = path.join(contentPath, relative);
        check.push(new Promise(resolve => {
          fs.access(newPath)
            .then(() => {
              resolve(newPath);
            })
            .catch(() => {
              resolve(null);
            });
        }));
      }
    }
  }
  const result = await Promise.all(check);
  for (let i = 0; i < result.length; i++) {
    if (result[i]) {
      return result[i];
    }
  }

  return null;
}

router.post('/queue/:key', async (req, res, next) => {
  try {
    const data = await queryPlex(`/library/metadata/${req.params.key}`);
    const part = data.Metadata[0].Media[0].Part[0];
    const filePath = part.file;
    const realPath = await findRealPath(filePath);
    if (!realPath) {
      return next(createHttpError(400), "Invalid real path");
    }
    const outputName = path.parse(realPath).name;
    const video = await (new ffmpeg(realPath));
    video.addCommand('-acodec', 'mp3');
    video.addCommand('-vcodec', 'copy');
    video.addCommand('-af', `"pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE"`);
    video.addCommand('', path.resolve(config.FFMPEG_OUTPUT_PATH, outputName + ".vtt"));
    video.addCommand('-y', '');
    queue.add(async () => {
      return new Promise((resolve, reject) => {
        video.save(path.resolve(config.FFMPEG_OUTPUT_PATH, outputName + ".mp4"), (err, file) => {
          if (err) {
            return reject(err);
          }
          resolve(file);
        });
      });
    }).catch(err => {
      console.error(err);
    });

    res.json({});
  } catch (err) {
    next(err);
  }
});

router.get('/metadata', (req, res, next) => {
  if (req.query.key.startsWith('/library/metadata/')) {
    next();
  } else {
    next(createHttpError(400));
  }
}, (req, res, next) => {
  queryPlex(req.query.key)
    .then(result => {
      const response = [];
      const metadata = result.Metadata;
      for (let i = 0; i < metadata.length; i++) {
        response.push({
          title: metadata[i].title,
          key: metadata[i].key,
          type: metadata[i].type,
          date: metadata[i].originallyAvailableAt,
          parentKey: metadata[i].parentKey,
          ratingKey: metadata[i].ratingKey
        });
      }
      res.json(response);
    })
    .catch(next);
});

router.get('/search', (req, res, next) => {
  if (!req.query.search) {
    next(createHttpError(400));
  } else {
    next();
  }
}, (req, res, next) => {
  queryPlex('/search', new url.URLSearchParams({
      query: req.query.search,
      limit: 30,
      includeCollections: 1,
      'X-Plex-Language': 'en'
    }))
    .then(json => {
      const results = /** @type {Array<*>} */ (json.Metadata);
      const response = [];
      if (results) {
        for (let i = 0; i < results.length; i++) {
          const data = {
            info: {
              summary: results[i].summary,
              title: results[i].title,
              grandparentTitle: results[i].grandparentTitle,
              parentTitle: results[i].parentTitle,
              type: results[i].type,
              date: results[i].originallyAvailableAt
            }
          };

          data.key = results[i].key;
          response.push(data);
        }
      }
      res.json(response);
    })
    .catch(next);
});

router.get('/manage', (req, res, next) => {
  fs.readdir(config.FFMPEG_OUTPUT_PATH)
    .then(contents => {
      const files = [];
      for (let i = 0; i < contents.length; i++) {
        const parsed = path.parse(contents[i]);
        if (parsed.ext === ".mp4") {
          files.push(parsed.name);
        }
      }
      res.render('manage', {
        contents: files,
        pending: queue.pending
      });
    })
    .catch(next);
});

router.post('/manage/set', (req, res, next) => {
  console.log(req.body);
  if (!req.body.content) {
    next(createHttpError(400));
  } else {
    next();
  }
}, (req, res, next) => {
  const content = req.body.content;
  fs.readFile(path.resolve(config.FFMPEG_OUTPUT_PATH, content + ".mp4"))
    .then(file => {
      clients.forEach(client => {
        client.forEach(socket => {
          socket.send({
            type: MessageTypes.SETUP,
            content: content
          });
        })
      });
      res.json({});
    })
    .catch(next);
});

module.exports = router;
