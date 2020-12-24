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

  function pauseWithoutRequest() {
    if (!video.onpause) {
      video.onpause = () => {};
    }

    const originalPauseEvent = video.onpause.bind(video);

    video.onpause = () => {};
    video.pause();
    video.onpause = originalPauseEvent;
  }

  function playWithoutRequest() {
    if (!video.onplay) {
      video.onplay = () => {};
    }

    const originalPlayEvent = video.onplay.bind(video);

    video.onplay = () => {};
    video.play().then(() => {
      video.onplay = originalPlayEvent;
    });
  }

  /**
   * 
   * @param {number} time 
   */
  function seekWithoutRequest(time) {
    if (!video.onseeking) {
      video.onseeking = () => {};
    }

    const originalSeekingEvent = video.onseeking.bind(video);

    video.onseeking = () => {};
    video.currentTime = time;
    video.onseeked = () => {
      video.onseeking = originalSeekingEvent;
    };
  }

  async function setupListeners() {
    const socket = await setupWebSocket();

    function onReady() {
      pauseWithoutRequest();
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
            playWithoutRequest();
          } else {
            video.onplaying = onReady;
            playWithoutRequest();
          }
          break;
        default:
          console.error("Request response not found: " + response['request']);
      }

      seekWithoutRequest(response['time']);
    }
  }

  let videoTime = 0;
  video.addEventListener('timeupdate', () => {
    if (!video.seeking) {
      videoTime = video.currentTime;
    }
  });

  video.onseeking = () => {
    const delta = video.currentTime - videoTime;
    if (Math.abs(delta) > 0.01) {
      alert("Seeking is disabled");
      video.currentTime = videoTime;
    }
  };
  video.onplay = () => {
    pauseWithoutRequest();
    alert("Wait for the host to start the video");
    video.currentTime = videoTime;
  };

  document.getElementById('begin').addEventListener('click', e => {
    setupListeners();
    e.target.style.display = "none";
  });
}
