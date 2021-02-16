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
  constructor(video: HTMLVideoElement, socket: WebSocket, toast: HTMLElement, startTime: number = 0) {
    super(video, socket, toast, false);

    video.currentTime = startTime;

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

  protected onSocketMessage(message: MessageEvent<any>) {
    super.onSocketMessage(message);

    const response: {
      type: MessageTypes;
      id: string;
      timestamp: number;
      data: any;
    } = JSON.parse(message.data);

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
      case MessageTypes.SETUP:
        this.video.pause();
        this.video.querySelector('source').src = `${BASEURL}/content/${response.data.content}.mp4`;
        this.video.querySelector('track').src = `${BASEURL}/content/${response.data.content}.vtt`;
        this.video.load();
        break;
      default:
        console.error(`Undefined message type detected: ${response.type}`);
        return;
    }
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

async function onLoad() {
  const continueContainer = document.getElementById('continueContainer');

  continueContainer.classList.add('d-none');
  const video: HTMLVideoElement = <HTMLVideoElement>document.getElementById("video");

  await new Promise<void>(resolve => {
    const onLoadedData = () => {
      resolve();
      video.removeEventListener('loadeddata', onLoadedData);
    }
    video.addEventListener('loadeddata', onLoadedData);
  });

  const [startTime, socket] = await Promise.all([new Promise<number>(resolve => {
    const lastVideoDuration = Number(VideoController.getData("duration"));
    if (lastVideoDuration !== video.duration) {
      // basic check for video changing
      return resolve(0);
    }
    const lastSavedTime = Number(VideoController.getData("time"));
    if (lastSavedTime) {
      continueContainer.classList.remove('d-none');
      continueContainer.classList.add('d-flex');

      continueContainer.querySelector('.header').textContent = `Continue from ${new Date(lastSavedTime * 1000).toISOString().substr(11, 8)}?`;
      const yesButton = <HTMLButtonElement>continueContainer.querySelector('.btn-primary');
      const noButton = <HTMLButtonElement>continueContainer.querySelector('.btn-danger');
      yesButton.addEventListener('click', () => {
        resolve(lastSavedTime);
      });
      noButton.addEventListener('click', () => {
        resolve(0);
      });
    } else {
      resolve(0);
    }
  }), setupWebSocket(false)])

  continueContainer.classList.add('d-none');
  VideoController.setData('duration', video.duration.toString());

  const toast = document.getElementById('toast');
  new VideoSenderController(video, socket, toast, startTime);
  video.removeAttribute('disabled');
}

window.addEventListener('load', () => {
  onLoad().catch(console.error);
});
