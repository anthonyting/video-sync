export {}

const MESSAGE_TYPES = {
  READY: 'ready',
  CONNECT: 'connect',
  DISCONNECT: 'disconnect'
};

async function setupWebSocket(): Promise<WebSocket> {
  const socket: WebSocket = new WebSocket(WEBSOCKET_SERVER);

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

class PeerVideo {
  private socket: WebSocket = null;
  private video: HTMLVideoElement;
  private peers: { id: string, ready: boolean }[] = [];
  private notifyPause: boolean = true;
  private notifyPlay: boolean = true;
  private pauseResolver: () => void = null;
  private playResolver: () => void = null;
  private played: Promise<void> = new Promise(resolve => this.playResolver = resolve);
  private paused: Promise<void> = new Promise(resolve => this.pauseResolver = resolve);
  constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  getStringifiedVideoData(ready: boolean = false, request: 'play' | 'pause' | 'seek') {
    return JSON.stringify(this.getVideoData(ready, request));
  }

  getVideoData(ready: boolean, request: 'play' | 'pause' | 'seek') {
    return {
      'time': this.video.currentTime,
      'timestamp': Math.floor(Date.now() / 1000),
      'request': request,
      'ready': ready
    };
  }

  resetPauseEventPromise() {
    this.pauseResolver = null;
    this.paused = new Promise(resolve => this.pauseResolver = resolve);
  }

  resetPlayEventPromise() {
    this.playResolver = null;
    this.played = new Promise(resolve => this.playResolver = resolve);
  }

  onPause() {
    this.socket.send(this.getStringifiedVideoData(false, 'pause'));
  }

  onPlay() {
    this.socket.send(this.getStringifiedVideoData(false, 'play'));
  }

  async pauseWithoutRequest(): Promise<number> {
    return new Promise(resolve => {
      this.notifyPause = false;
      this.video.pause();
      this.paused.then(() => {
        this.notifyPause = true;
        this.resetPauseEventPromise();
        resolve(Date.now());
      });
    });
  }

  playWithoutRequest() {
    this.notifyPlay = false;
    this.video.play();
    this.played.then(() => {
      this.notifyPlay = true;
      this.resetPlayEventPromise();
    });
  }

  async setupListeners() {
    this.socket = await setupWebSocket();

    // respond to a message on new connnection
    this.socket.onmessage = (e) => {
      const data: {
        type: 'ready' | 'connect';
        id: string; data: object;
      } = JSON.parse(e.data);

      const id = data['id'];

      switch (data['type']) {
        case MESSAGE_TYPES.READY:
          console.log(new Date() + ": " + id + " is connected");
          let allReady = true;
          for (let i = 0; i < this.peers.length; i++) {
            if (this.peers[i].id === id) {
              this.peers[i].ready = true;
              allReady = allReady && i === this.peers.length - 1;
            } else {
              allReady = false;
            }
          }
          if (allReady) {
            this.playWithoutRequest();
            this.socket.send(this.getStringifiedVideoData(true, 'play'));
          }
          break;
        case MESSAGE_TYPES.CONNECT:
          console.log(new Date() + ": " + id + " is connecting");
          for (let i = 0; i < this.peers.length; i++) {
            if (this.peers[i].id === id) {
              this.peers[i].ready = false;
              break;
            }
          }
          this.video.pause();
          break;
        case MESSAGE_TYPES.DISCONNECT:
          console.log(new Date() + ": " + id + " disconnected");
          for (let i = 0; i < this.peers.length; i++) {
            if (this.peers[i].id === id) {
              this.peers.splice(i);
              break;
            }
          }
          break;
        default:
          console.error("Undefined message type detected: " + data['type']);
          return;
      }
    }

    this.video.onpause = (e) => {
      if (this.notifyPause) {
        this.socket.send(this.getStringifiedVideoData(false, 'pause'));
      }
      this.pauseResolver();
      this.resetPauseEventPromise();
    }

    this.video.onplaying = async (e) => {
      if (this.notifyPlay) {
        e.preventDefault();
        await this.pauseWithoutRequest();
        this.socket.send(this.getStringifiedVideoData(false, 'play'));
      }
      this.playResolver();
      this.resetPlayEventPromise();
    }

    this.video.onseeked = (e) => {
      e.preventDefault();
      this.pauseWithoutRequest();
      this.socket.send(this.getStringifiedVideoData(false, 'seek'));
    }
  }
}

window.addEventListener('load', () => {
  const video: HTMLVideoElement = <HTMLVideoElement>document.getElementById("video");
  document.getElementById('begin').addEventListener('click', e => {
    new PeerVideo(video).setupListeners();
    (<HTMLButtonElement>e.target).style.display = "none";
  });
});
