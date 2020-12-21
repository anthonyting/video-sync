import {
  setupWebSocket,
  MessageTypes,
  VideoController,
  VideoEvent
} from './common'

interface Peer {
  id: string,
  ready: boolean
};

class VideoSenderController extends VideoController {
  private peers: Peer[] = [];
  constructor(video: HTMLVideoElement, socket: WebSocket) {
    super(video, socket);
    this.socket.addEventListener('message', e => {
      const data: {
        type: MessageTypes;
        id: string;
        data: object;
      } = JSON.parse(e.data);

      const id = data['id'];
      switch (data.type) {
        case MessageTypes.READY:
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
            this.forcePlay();
            this.socket.send(this.getStringifiedVideoData(true, 'play'));
          }
          break;
        case MessageTypes.CONNECT:
          console.log(new Date() + ": " + id + " is connecting");
          for (let i = 0; i < this.peers.length; i++) {
            if (this.peers[i].id === id) {
              this.peers[i].ready = false;
              break;
            }
          }
          this.video.pause();
          break;
        case MessageTypes.DISCONNECT:
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
    });

    this.setVideoEvent(VideoEvent.pause, () => {
      this.socket.send(this.getStringifiedVideoData(false, VideoEvent.pause));
    });

    this.setVideoEvent(VideoEvent.play, () => {
      this.forcePause();
      this.socket.send(this.getStringifiedVideoData(false, VideoEvent.play));
    });

    this.setVideoEvent(VideoEvent.seeked, () => {
      this.forcePause();
      this.socket.send(this.getStringifiedVideoData(false, 'seek'));
    });
  }

  private getStringifiedVideoData(ready: boolean = false, request: 'play' | 'pause' | 'seek') {
    return JSON.stringify(this.getVideoData(ready, request));
  }

  private getVideoData(ready: boolean, request: 'play' | 'pause' | 'seek') {
    return {
      time: this.video.currentTime,
      timestamp: Math.floor(Date.now() / 1000),
      request: request,
      ready: ready
    };
  }
}

window.addEventListener('load', () => {
  const video: HTMLVideoElement = <HTMLVideoElement>document.getElementById("video");
  setupWebSocket(false)
    .then(socket => {
      (<HTMLButtonElement>document.getElementById('begin')).addEventListener('click', e => {
        new VideoSenderController(video, socket);
        (<HTMLButtonElement>e.target).style.display = "none";
      });
    })
    .catch(console.error);
});
