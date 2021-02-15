const fetch = require('node-fetch').default;
const config = require("../config");
const router = require('express').Router();
const url = require('url');
const createHttpError = require('http-errors');
const clients = require('../app').clients;
const ffmpeg = require('ffmpeg');

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

router.get('/metadata', (req, res, next) => {
  if (req.query.id && req.query.show) {
    req.query.show = req.query.show === "true";
    next();
  } else {
    next(createHttpError(400));
  }
}, (req, res, next) => {
  queryPlex(`/library/metadata/${req.query.id}${req.query.show ? '/grandchildren' : ''}`)
    .then(result => {
      const response = [];
      const metadata = result.Metadata;
      for (let i = 0; i < metadata.length; i++) {
        response.push({
          title: metadata[i].title,
          key: metadata[i].ratingKey,
          type: metadata[i].type,
          date: metadata[i].originallyAvailableAt
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
      'X-Plex-Language': 1
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

          data.id = results[i].ratingKey;
          response.push(data);
        }
      }
      res.json(response);
    })
    .catch(next);
});

module.exports = router;
