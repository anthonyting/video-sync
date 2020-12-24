import {
  setupWebSocket,
  MessageTypes,
  VideoController,
  VideoEvent,
} from './common'

interface Peer {
  id: string,
  ready: boolean
};

class VideoSenderController extends VideoController {
  private peers: Peer[] = [];
  constructor(video: HTMLVideoElement, socket: WebSocket, toast: HTMLElement) {
    super(video, socket, toast);
    this.socket.addEventListener('message', e => {
      const response: {
        type: MessageTypes;
        id: string;
        timestamp: number;
        data: any;
      } = JSON.parse(e.data);

      const id = response.id;
      switch (response.type) {
        case MessageTypes.RECONNECT: {
          console.log(new Date() + ": " + id + " is connected");
          const eventToSend: VideoEvent = this.video.paused ? VideoEvent.pause : VideoEvent.play;
          const videoData: any = this.getVideoData(eventToSend, MessageTypes.RESPOND);
          videoData.client = id;
          this.socket.send(JSON.stringify(videoData));
          break;
        }
        case MessageTypes.CONNECT:
          console.log(new Date() + ": " + id + " is connecting");
          for (let i = 0; i < this.peers.length; i++) {
            if (this.peers[i].id === id) {
              this.peers[i].ready = false;
              break;
            }
          }
          // this.video.pause();
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
        case MessageTypes.TIME:
          break;
        default:
          console.error(`Undefined message type detected: ${response.type}`);
          return;
      }
    });

    this.setVideoEvent(VideoEvent.pause, () => {
      this.socket.send(this.getDispatchData(VideoEvent.pause));
    });

    this.setVideoEvent(VideoEvent.play, () => {
      this.socket.send(this.getDispatchData(VideoEvent.play));
    });

    this.setVideoEvent(VideoEvent.seeked, () => {
      this.forcePause();
      this.socket.send(this.getDispatchData(VideoEvent.seeking));
    });

    this.syncTime();
  }

  private getDispatchData(request: VideoEvent) {
    return JSON.stringify(this.getVideoData(request, MessageTypes.DISPATCH));
  }

  private getVideoData(request: VideoEvent, type: MessageTypes) {
    return {
      type: type,
      time: this.video.currentTime,
      timestamp: Date.now() + this.serverTimeDelta,
      request: request
    };
  }
}

window.addEventListener('load', () => {
  const video: HTMLVideoElement = <HTMLVideoElement>document.getElementById("video");
  setupWebSocket(false)
    .then(socket => {
      const toast = document.getElementById('toast');
      new VideoSenderController(video, socket, toast);
      video.removeAttribute('disabled');
    })
    .catch(console.error);
});
