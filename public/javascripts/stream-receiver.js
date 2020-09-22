'use strict'

window.onload = () => {
  /** @type {HTMLVideoElement} */
  const video = document.getElementById("video");

  /**
   * @returns {Promise<WebSocket>}
   */
  async function setupWebSocket() {
    const socket = new WebSocket('wss://' + window.location.host + "/abcde?isViewer=true");

    const socketPromise = new Promise((resolve, reject) => {
      socket.onopen = () => {
        console.log("Connected to websocket");
        resolve(socket);
      };
      socket.onerror = error => {
        console.error("Error connecting to websocket: ", error)
        reject(error);
      };
    });

    return socketPromise;
  }


  /**
   * @enum
   */
  const MESSAGE_TYPES = {
    'READY': 'ready',
    'CONNECT': 'connect',
    'DISCONNECT': 'disconnect'
  };

  function onPlay() {}

  async function setupListeners() {
    const socket = await setupWebSocket();

    function onReady() {
      video.pause();
      socket.send(JSON.stringify({
        'type': MESSAGE_TYPES.READY
      }));
    }

    video.onplaying = onReady;
    video.play();

    socket.onmessage = (e) => {
      /**
       * @type {{
       * time: number,
       * timestamp: number,
       * ready: boolean,
       * request: 'play' | 'pause' | 'seek'
       * }}
       */
      const response = JSON.parse(e.data);

      switch (response['request']) {
        case 'pause':
          video.pause();
          break;
        case 'seek':
          video.onplaying = onReady;
          break;
        case 'play':
          if (response['ready']) {
            video.onplaying = onPlay;
            video.play();
          } else {
            video.onplaying = onReady;
            video.play();
          }
          break;
        default:
          console.error("Request response not found: " + response['request']);
      }

      video.currentTime = response['time'];
    }
  }

  document.getElementById('begin').addEventListener('click', e => {
    setupListeners();
    e.target.style.display = "none";
  });
}