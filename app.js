var createError = require('http-errors');
var path = require('path');
var logger = require('morgan');
const express = require('express');

const WebSocket = require('ws');
const sessionParser = require('./session');
const url = require('url');

const wss = new WebSocket.Server({
  noServer: true
});

/**
 * @type {Object.<string, {socket: import('ws'), interval: number}}
 */
const clients = {};

/**
 * 
 * @param {import('ws')} ws 
 * @param {string} clientId 
 */
function createStreamerSocket(ws, clientId) {
  console.log("creating streamer socket");

  ws.on('message', msg => {
    for (const id of Object.keys(clients)) {
      if (id != clientId) {
        clients[id].socket.send(msg);
      }
    }
  });

  ws.on('close', e => {
    console.log("closing streamer socket");
    // allow users to control stream themselves then?
  });
}

/**
 * @enum
 */
const MESSAGE_TYPES = {
  'READY': 'ready',
  'CONNECT': 'connect',
  'DISCONNECT': 'disconnect'
};

class StreamerSocket {

  constructor() {
    /** @type {Array<Object>} */
    this.queuedMessages = [];
    /** @type {import('ws')} */
    this.streamer = null;
  }

  setStreamer(ws) {
    this.streamer = ws;
    for (let i = 0; i < this.queuedMessages.length; i++) {
      this.streamer.send(JSON.stringify(this.queuedMessages[i]));
    }
    this.queuedMessages.length = 0;
  }

  send(msg) {
    if (!this.streamer) {
      this.queuedMessages.push(msg);
    } else {
      this.streamer.send(JSON.stringify(msg));
    }
  }

  isSet() {
    return Boolean(this.streamer);
  }

  close() {
    this.streamer.close();
  }
}

function initApp(app, server) {
  const indexRouter = require('./routes/index');
  // view engine setup
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'pug');

  app.use(logger('short'));
  app.use(express.json());
  app.use(express.urlencoded({
    extended: false
  }));
  app.use('/abcde', express.static(path.join(__dirname, 'public')));
  app.use(sessionParser);

  app.set('trust proxy', 1);

  app.use('/abcde', indexRouter);

  // catch 404 and forward to error handler
  app.use(function (req, res, next) {
    next(createError(404));
  });

  // error handler
  app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
  });

  server.on('upgrade', (req, socket, head) => {
    sessionParser(req, {}, () => {
      if (!req.session || !req.session.hasAccess) {
        socket.end();
      } else {
        wss.handleUpgrade(req, socket, head, ws => {
          wss.emit('connection', ws, req);
        });
      }
    });
  });

  let idGen = 0;
  let streamerSocket = new StreamerSocket();
  const streamerMsgs = [];
  wss.on('connection', (ws, req) => {
    sessionParser(req, {}, () => {
      if (!req.session) {
        return ws.close(1008, "Unauthorized");
      }

      const queryParams = new url.URLSearchParams(req._parsedUrl.search);
      const isViewer = Boolean(queryParams.get('isViewer'));

      const clientId = idGen++;
      if (isViewer && req.session.hasAccess) {
        clients[clientId] = {
          socket: ws,
          interval: null
        };
        streamerSocket.send({
          'type': MESSAGE_TYPES.CONNECT,
          'id': clientId
        });
        ws.on('close', () => {
          streamerSocket.send({
            'type': MESSAGE_TYPES.DISCONNECT,
            'id': clientId
          });
          clearInterval(clients[clientId].interval);
          delete clients[clientId];
        });
        ws.on('message', msg => {
          const data = JSON.parse(msg);
          switch (data['type']) {
            case MESSAGE_TYPES.READY:
              streamerSocket.send({
                'type': MESSAGE_TYPES.READY,
                'id': clientId
              });
              break;
            default:
              console.error("Undefined message type received: " + data['type']);
              break;
          }
        });
      } else if (req.session.hasStreamAccess) {
        if (!streamerSocket.isSet()) {
          streamerSocket.setStreamer(ws);
          createStreamerSocket(ws, clientId, streamerMsgs);
        } else {
          streamerSocket.close();
          streamerSocket.setStreamer(ws);
          createStreamerSocket(ws, clientId, streamerMsgs);
        }
      } else {
        return ws.close(1008, "Unauthorized");
      }
      // clients[clientId].interval = setInterval(() => {
      //   ws.ping();
      //   console.log("ping to: " + clientId);
      // }, 20000)
      // ws.on('pong', () => {
      //   console.log("pong from: " + clientId);
      // });
    });
  });
}

module.exports = {
  initApp,
  clients
};