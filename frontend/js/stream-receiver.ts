export {}

const MESSAGE_TYPES = {
  READY: 'ready',
  CONNECT: 'connect',
  DISCONNECT: 'disconnect'
};

async function setupWebSocket(): Promise<WebSocket> {
  const socket: WebSocket = new WebSocket('wss://' + window.location.host + "/abcde?isViewer=true");

  const socketPromise: Promise<WebSocket> = new Promise((resolve, reject) => {
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

function onPlay() { }

window.addEventListener('load', () => {
  const video: HTMLVideoElement = <HTMLVideoElement>document.getElementById("video");

  function pauseWithoutRequest() {
    if (!video.onpause) {
      video.onpause = () => { };
    }

    const originalPauseEvent: (this: GlobalEventHandlers, ev: Event) => any = video.onpause.bind(video);

    video.onpause = () => { };
    video.pause();
    video.onpause = originalPauseEvent;
  }

  function playWithoutRequest() {
    if (!video.onplay) {
      video.onplay = () => { };
    }

    const originalPlayEvent: (this: GlobalEventHandlers, ev: Event) => any = video.onplay.bind(video);

    video.onplay = () => { };
    video.play().then(() => {
      video.onplay = originalPlayEvent;
    });
  }


  function seekWithoutRequest(time: number) {
    if (!video.onseeking) {
      video.onseeking = () => { };
    }

    const originalSeekingEvent = video.onseeking.bind(video);

    video.onseeking = () => { };
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
      const response: {
        time: number;
        timestamp: number;
        ready: boolean;
        request: 'play' | 'pause' | 'seek';
      } = JSON.parse(e.data);

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
    alert("Wait for the broadcaster to start the video");
    video.currentTime = videoTime;
  };

  (<HTMLButtonElement>document.getElementById('begin')).addEventListener('click', e => {
    setupListeners();
    (<HTMLButtonElement>e.target).style.display = "none";
  });
});
