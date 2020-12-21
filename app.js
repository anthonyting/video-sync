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
 * @type {Object.<string, {socket: import('ws'), interval: number}} clients
 */
const clients = {};

/**
 * 
 * @param {import('ws')} ws 
 * @param {number} receivedAt
 * @param {number} clientTime
 */
function sendTimeDifference(ws, receivedAt, clientTime) {
  ws.send(JSON.stringify({
    type: MessageTypes.TIME,
    data: {
      timeDelta: receivedAt - clientTime
    },
    timestamp: Date.now()
  }));
}

/**
 * 
 * @param {import('ws')} ws 
 * @param {string} clientId 
 */
function createStreamerSocket(ws, clientId) {
  console.log("Creating streamer socket: " + clientId);

  new KeepAlive({
    ws
  });

  ws.on('message', msg => {
    const now = Date.now();

    let parsed;
    try {
      parsed = JSON.parse(msg);
    } catch (err) {
      console.warn("Error parsing streamer message: ", err);
      return;
    }

    switch (parsed.type) {
      case MessageTypes.DISPATCH:
        for (const id of Object.keys(clients)) {
          if (id != clientId) {
            clients[id].socket.send(msg);
          }
        }
        break;
      case MessageTypes.RESPOND:
        clients[parsed.client].socket.send(msg);
        break;
      case MessageTypes.TIME:
        sendTimeDifference(ws, now, parsed.timestamp);
        break;
      default:
        console.warn(`Missing streamer message request type: ${parsed.request}`);
    }
  });

  ws.on('close', e => {
    console.log("Closing streamer socket");
    // allow users to control stream themselves then?
  });
}

/**
 * @enum
 */
const MessageTypes = {
  RECONNECT: 'reconnect',
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  DISPATCH: 'dispatch',
  RESPOND: 'respond',
  TIME: 'time',
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

      const sessionId = req.session.clientId;
      const clientId = sessionId || idGen++;
      req.session.clientId = clientId;
      if (isViewer && req.session.hasAccess) {
        console.log(sessionId ? `Old viewer reconnected: ${clientId}` : `New viewer connected: ${clientId}`);

        clients[clientId] = {
          socket: ws
        };
        streamerSocket.send({
          type: MessageTypes.CONNECT,
          id: clientId
        });
        ws.on('close', (code, reason) => {
          streamerSocket.send({
            type: MessageTypes.DISCONNECT,
            id: clientId
          });
          if (code === 1006) {
            console.log(`${clientId} disconnected abrubtly: ` + reason);
          } else {
            delete clients[clientId];
          }
        });
        ws.on('message', msg => {
          const now = Date.now();
          const parsed = JSON.parse(msg);
          switch (parsed.type) {
            case MessageTypes.RECONNECT:
              streamerSocket.send({
                type: MessageTypes.RECONNECT,
                id: clientId
              });
              break;
            case MessageTypes.TIME:
              sendTimeDifference(ws, now, parsed.timestamp);
              break;
            default:
              console.error("Undefined message type received: " + parsed.type);
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

      new KeepAlive({
        clients,
        clientId,
        ws
      });
    });
  });
}

class KeepAlive {

  constructor({
    ws = null
  }) {
    /** @type {import('ws')} */
    this.socket = ws;
    /** @type {number} */
    this.closeTimeout = null;

    this.pingInterval = setInterval(() => {
      this.checkPing();
    }, 20000);

    this.socket.on('pong', () => {
      clearInterval(this.closeTimeout);
    });

    this.socket.on('close', () => {
      clearTimeout(this.closeTimeout);
      clearInterval(this.pingInterval);
    });
  }

  checkPing() {
    clearTimeout(this.closeTimeout);
    this.socket.ping();
    this.closeTimeout = setTimeout(() => {
      clearInterval(this.pingInterval);
      this.socket.close();
      console.warn("Disconecting user after no response for 10 seconds");
    }, 10000);
  }
}

module.exports = {
  initApp,
  clients
};
