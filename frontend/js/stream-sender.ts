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

const enum StreamerMessages {
  DISPATCH = 'dispatch',
  RESPOND = 'respond'
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
        case MessageTypes.RECONNECT:
          console.log(new Date() + ": " + id + " is connected");
          const eventToSend: VideoEvent = this.video.paused ? VideoEvent.pause : VideoEvent.play;
          const response: any = this.getVideoData(eventToSend, StreamerMessages.RESPOND);
          response.client = id;
          this.socket.send(JSON.stringify(response));
          break;
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
        default:
          console.error("Undefined message type detected: " + data['type']);
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
  }

  private getDispatchData(request: VideoEvent) {
    return JSON.stringify(this.getVideoData(request, StreamerMessages.DISPATCH));
  }

  private getVideoData(request: VideoEvent, type: StreamerMessages) {
    return {
      type: type,
      time: this.video.currentTime,
      request: request
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
