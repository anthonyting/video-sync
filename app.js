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
 * @type {Map<string, {socket: import('ws'), interval: number}>} clients
 */
const clients = new Map();

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
    this.host = null;
  }

  setStreamer(ws, sessionID) {
    if (this.host) {
      this.close();
    }

    this.host = ws;
    console.log("Creating host socket: " + sessionID);

    new KeepAlive({
      ws
    });

    clients.forEach(({socket}) => {
      socket.send(JSON.stringify({
        type: MessageTypes.CONNECT,
        timestamp: Date.now()
      }));
    });

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
          console.warn("Error parsing host message: ", err);
          return;
        }

        switch (parsed.type) {
          case MessageTypes.DISPATCH:
            clients.forEach(({
              socket
            }) => {
              socket.send(msg);
            });
            break;
          case MessageTypes.RESPOND:
            const client = clients.get(parsed.client);
            if (client) {
              const socket = client.socket;
              if (socket) {
                socket.send(msg);
              } else {
                console.warn(`Missing client for id: ${parsed.client}`);
              }
            }
            break;
          case MessageTypes.TIME:
            sendTime(ws, requestReceivedAt, parsed.timestamp);
            break;
          default:
            console.warn(`Missing host message request type: ${parsed.request}`);
        }
      } catch (err) {
        console.error("Error parsing message: ", msg, err);
      }
    });

    ws.on('close', e => {
      console.log("Closing host socket");
      clients.forEach(({
        socket
      }) => {
        socket.send(JSON.stringify({
          type: MessageTypes.DISCONNECT,
          timestamp: Date.now()
        }));
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

  let streamerSocket = new StreamerSocket();
  const streamerMsgs = [];
  wss.on('connection', (ws, req) => {
    sessionParser(req, {}, () => {
      if (!req.session) {
        return ws.close(1008, "Unauthorized");
      }

      const queryParams = new url.URLSearchParams(req._parsedUrl.search);
      const isViewer = Boolean(queryParams.get('isViewer'));

      const sessionID = req.sessionID;
      if (isViewer && req.session.hasAccess) {
        console.log(`Viewer connected: ${sessionID}`);

        clients.set(sessionID, {
          socket: ws
        });
        streamerSocket.send({
          type: MessageTypes.CONNECT,
          id: sessionID
        });
        ws.on('close', (code, reason) => {
          streamerSocket.send({
            type: MessageTypes.DISCONNECT,
            id: sessionID
          });
          if (code === 1006) {
            console.log(`${sessionID} disconnected abrubtly: ${reason}`);
          } else {
            clients.delete(sessionID);
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
              console.warn("Error parsing client message: ", err);
              return;
            }
            switch (parsed.type) {
              case MessageTypes.RECONNECT:
                streamerSocket.send({
                  type: MessageTypes.RECONNECT,
                  id: sessionID
                });
                break;
              case MessageTypes.TIME:
                sendTime(ws, requestReceivedAt, parsed.timestamp);
                break;
              default:
                console.error(`Undefined message type received: ${parsed.type}`);
                break;
            }
          } catch (err) {
            console.error("Error parsing message: ", msg, err);
          }
        });
      } else if (req.session.hasStreamAccess) {
        streamerSocket.setStreamer(ws, sessionID);
      } else {
        return ws.close(1008, "Unauthorized");
      }

      new KeepAlive({
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
