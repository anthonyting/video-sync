var createError = require('http-errors');
var path = require('path');
var logger = require('morgan');
const express = require('express');

const WebSocket = require('ws');
const sessionParser = require('./session');
const url = require('url');
const {
  BASEURL,
  SITE_URL
} = require('./config');

const http = require('http');

const MessageTypes = require('./src/constants').MessageTypes;

const wss = new WebSocket.Server({
  noServer: true
});

/**
 * @type {Map<string, [{socket: import('ws'), keepalive: KeepAlive}]>} clients
 */
const clients = new Map();
/** @type {{socket: ?StreamerSocket}} */
const host = {
  socket: null
};

/**
 * 
 * @param {import('ws')} ws 
 * @param {number} requestReceivedAt
 * @param {number} requestSentAt
 */
function sendTime(ws, requestReceivedAt, requestSentAt) {
  ws.send(JSON.stringify({
    type: MessageTypes.TIME,
    timestamp: requestReceivedAt,
    data: {
      requestSentAt: requestSentAt,
      responseSentAt: Date.now()
    }
  }));
}

/**
 * 
 * @param {*} message 
 * @param {import('ws') | StreamerSocket} additionalSocket 
 * @param {*} currentSocket 
 */
function sendToAllClients(message, additionalSocket, currentSocket) {
  clients.forEach(clientSessions => {
    clientSessions.forEach(session => {
      if (currentSocket !== session.socket) {
        session.socket.send(JSON.stringify(message));
      }
    });
  });

  if (additionalSocket && additionalSocket !== currentSocket) {
    additionalSocket.send(message);
  }
}

class StreamerSocket {

  constructor() {
    /** @type {Array<Object>} */
    this.queuedMessages = [];
    /** @type {import('ws')} */
    this.host = null;
    /** @type {KeepAlive} */
    this.keepalive = null;
  }

  setStreamer(ws, sessionID) {
    if (this.host) {
      this.close();
    }

    this.host = ws;
    console.log("Creating host socket: " + sessionID);

    this.keepalive = new KeepAlive({
      ws
    });

    sendToAllClients({
      type: MessageTypes.CONNECT,
      timestamp: Date.now()
    }, null, null);

    ws.on('message', msg => {
      try {
        const requestReceivedAt = Date.now();

        let parsed;
        try {
          parsed = JSON.parse(msg);
          if (!parsed || typeof parsed !== 'object') {
            throw new Error("Streamer message not an object");
          }
        } catch (err) {
          console.warn("Error parsing host message: ", err.message);
          return;
        }

        switch (parsed.type) {
          case MessageTypes.CHECK:
            // fall through
          case MessageTypes.DISPATCH:
            sendToAllClients(parsed, null, null);
            break;
          case MessageTypes.RESPOND: {
            const clientSessions = clients.get(parsed.client);
            if (clientSessions) {
              for (let i = 0, n = clientSessions.length; i < n; i++) {
                const socket = clientSessions[i].socket;
                if (socket) {
                  if (socket.OPEN) {
                    socket.send(msg);
                  } else {
                    console.warn(`Attempting to send a message to a socket with readyState: ${socket.readyState}`)
                  }
                } else {
                  console.warn(`Missing socket for id: ${parsed.client}`);
                }
              }
            } else {
              console.warn(`Missing client sessions for: ${parsed.client}`);
            }
            break;
          }
          case MessageTypes.TIME:
            sendTime(ws, requestReceivedAt, parsed.timestamp);
            break;
          default:
            console.warn(`Missing host message request type: ${parsed.type}`);
        }
      } catch (err) {
        console.error("Error parsing message: ", msg, err);
      }
    });

    ws.on('close', e => {
      console.log("Closing host socket");
      clients.forEach(clientSessions => {
        for (let i = 0, n = clientSessions.length; i < n; i++) {
          clientSessions[i].socket.send(JSON.stringify({
            type: MessageTypes.DISCONNECT,
            timestamp: Date.now()
          }));
        }
      });
      // allow users to control stream themselves then?
    });

    for (let i = 0; i < this.queuedMessages.length; i++) {
      this.host.send(JSON.stringify(this.queuedMessages[i]));
    }
    this.queuedMessages.length = 0;
  }

  send(msg) {
    if (!this.host) {
      this.queuedMessages.push(msg);
    } else {
      this.host.send(JSON.stringify(msg));
    }
  }

  isSet() {
    return Boolean(this.host);
  }

  close() {
    this.host.close();
    this.host = null;
    this.keepalive = null;
  }
}

const STATIC_MANIFEST = require('./public/dist/manifest.json');
const fs = require('fs');

function initApp(app, server) {
  const indexRouter = require('./routes/index');

  fs.watchFile(path.resolve(__dirname, './public/dist/manifest.json'), (curr, prev) => {
    delete require.cache[require.resolve('./public/dist/manifest.json')];
    app.locals.STATIC_MANIFEST = require('./public/dist/manifest.json');
  });

  app.locals.STATIC_MANIFEST = STATIC_MANIFEST;

  // view engine setup
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'pug');

  app.use(logger('short'));
  app.use(express.json());
  app.use(express.urlencoded({
    extended: false
  }));
  app.use(BASEURL, express.static(path.join(__dirname, 'public'), {
    maxAge: 604800 * 1000 // a week
  }));
  app.use(sessionParser);

  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.locals.BASEURL = BASEURL;
    res.locals.SITE_URL = SITE_URL;
    next();
  });
  app.use(BASEURL, indexRouter);

  app.use((req, res, next) => {
    next(createError(404));
  });

  // error handler
  app.use((err, req, res, next) => {
    err.status = Number(err.status) || 500;
    res.locals.error = err.expose ? err.message : http.STATUS_CODES[err.status];

    if (err.status && 400 <= err.status && err.status < 500) {
      console.warn(err.message);
    } else {
      console.error(err);
    }

    res.status(err.status);

    if (res.locals.jsonError) {
      res.json({
        error: err.message
      });
    } else {
      res.render('error');
    }
  });

  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit('connection', ws, req);
    });
  });

  let streamerSocket = new StreamerSocket();
  host.socket = streamerSocket;
  wss.on('connection', (ws, req) => {
    sessionParser(req, {}, () => {
      if (!req.session || !req.session.hasAccess) {
        return ws.close(1008, "Unauthorized");
      }

      const queryParams = new url.URLSearchParams(req._parsedUrl.search);
      const isViewer = Boolean(queryParams.get('isViewer'));

      const sessionId = req.sessionID;
      if (isViewer && req.session.hasAccess) {
        console.log(`Viewer connected: ${sessionId}`);
        ws.on('close', (code, reason) => {
          streamerSocket.send({
            type: MessageTypes.DISCONNECT,
            id: sessionId
          });
          console.log(`${sessionId} disconnected: ${reason ? `${code}:${reason}` : code}`);
          const sessions = clients.get(sessionId);
          const activeSessionIndex = sessions.findIndex(element => element.socket === ws);
          if (activeSessionIndex !== -1) {
            delete sessions[activeSessionIndex].keepalive;
            delete sessions[activeSessionIndex].socket;
            sessions.splice(activeSessionIndex, 1);
          } else {
            console.warn(`Could not find active session in session array for ${sessionId}`);
          }
          if (sessions.length === 0) {
            clients.delete(sessionId);
          }
        });
        ws.on('message', msg => {
          try {
            const requestReceivedAt = Date.now();
            let parsed;
            try {
              parsed = JSON.parse(msg);
              if (!parsed || typeof parsed !== 'object') {
                throw new Error("Client message not an object");
              }
            } catch (err) {
              console.warn("Error parsing client message: ", err.message);
              return;
            }
            switch (parsed.type) {
              case MessageTypes.RECONNECT:
                streamerSocket.send({
                  type: MessageTypes.RECONNECT,
                  id: sessionId
                });
                break;
              case MessageTypes.TIME:
                sendTime(ws, requestReceivedAt, parsed.timestamp);
                break;
              case MessageTypes.DISPATCH:
                console.log(`Client dispatch from ${sessionId}: ${parsed.request}`)
                sendToAllClients({
                  type: MessageTypes.DISPATCH,
                  time: parsed.time,
                  timestamp: parsed.timestamp,
                  request: parsed.request
                }, streamerSocket, ws);
                break;
              default:
                console.error(`Undefined message type received: ${parsed.type}`);
                break;
            }
          } catch (err) {
            console.error("Error parsing message: ", msg, err);
          }
        });

        const clientSessions = clients.get(sessionId);
        const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
        if (!clientSessions) {
          clients.set(sessionId, [{
            socket: ws,
            keepalive: new KeepAlive({
              ws
            }),
            ip: ip
          }]);
        } else {
          clientSessions.push({
            socket: ws,
            keepalive: new KeepAlive({
              ws
            }),
            ip: ip
          });
        }
        streamerSocket.send({
          type: MessageTypes.CONNECT,
          id: sessionId
        });
      } else if (req.session.hasStreamAccess) {
        console.log(`Connecting host: ${sessionId}`);
        streamerSocket.setStreamer(ws, sessionId);
      } else {
        return ws.close(1008, "Unauthorized");
      }
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
      this.socket = null;
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
  clients,
  host
};
