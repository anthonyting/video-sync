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

const clients = {};

function createStreamerSocket(ws, clientId) {
  ws.on('message', msg => {
    for (const id of Object.keys(clients)) {
      if (id != clientId) {
        clients[id].send(msg);
      }
    }
  });
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
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(sessionParser);

  app.use('/', indexRouter);

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
  let streamerSocket = null;
  wss.on('connection', (ws, req) => {
    sessionParser(req, {}, () => {
      if (!req.session) {
        return ws.close(1008, "Unauthorized");
      }

      const queryParams = new url.URLSearchParams(req._parsedUrl.search);
      const isViewer = Boolean(queryParams.get('isViewer'));

      const clientId = idGen++;
      if (isViewer && req.session.hasAccess) {
        clients[clientId] = ws;
        ws.on('close', () => {
          delete clients[clientId];
        });
        ws.on('message', msg => {
          streamerSocket.send(msg);
        });
      } else if (req.session.hasStreamAccess) {
        if (!streamerSocket) {
          streamerSocket = ws;
          createStreamerSocket(ws, clientId);
        } else {
          streamerSocket.close();
          streamerSocket = ws;
          createStreamerSocket(ws, clientId);
        }
      } else {
        ws.close(1008, "Unauthorized");
      }
    });
  });
}

module.exports = {
  initApp,
  clients
};