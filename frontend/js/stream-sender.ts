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
  private stateDispatcherInterval: number;
  constructor(video: HTMLVideoElement, socket: WebSocket, toast: HTMLElement, startTime: number = 0) {
    super(video, socket, toast, false);

    if (video.readyState !== 0) {
      video.currentTime = startTime;
    }

    // this.setVideoEvent(VideoEvent.pause, () => {
    //   if (!this.isSeeking) {
    //     this.socket.send(this.getDispatchData(VideoEvent.pause));
    //   }
    // });

    // this.setVideoEvent(VideoEvent.play, () => {
    //   if (!this.isSeeking) {
    //     this.socket.send(this.getDispatchData(VideoEvent.play));
    //   }
    // });

    // this.setVideoEvent(VideoEvent.seeked, () => {
    //   this.forcePause().then(() => {
    //     this.socket.send(this.getDispatchData(VideoEvent.seeking));
    //     this.sendStateSync(this.getState());
    //   });
    // });

    this.syncTime();
    this.setupStateSync();
  }

  private setupStateSync() {
    let lastState = this.getState();
    this.stateDispatcherInterval = window.setInterval(() => {
      lastState = this.sendStateSync(lastState);
    }, 30000);
  }

  private sendStateSync(lastState: VideoEvent) {
    const currentState = this.getState();
    if (lastState !== currentState) {
      this.socket.send(this.getDispatchData(this.getState(), MessageTypes.CHECK));
    }
    return currentState;
  }

  protected async onSocketMessage(message: MessageEvent<any>) {
    const responseReceivedAt = Date.now();

    await super.onSocketMessage(message);

    const response: {
      type: MessageTypes;
      id: string;
      timestamp: number;
      data: any;
      request: VideoEvent,
      time: number
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
      case MessageTypes.DISPATCH:
        await this.invokeState(response.request, {
          request: response.request,
          time: response.time,
          timestamp: response.timestamp,
          data: response.data,
          type: response.type
        }, responseReceivedAt);
        break;
      case MessageTypes.TIME:
        break;
      case MessageTypes.SETUP:
        this.video.pause();
        this.video.querySelector('source').src = `${CONTENT_BASE_URL}${response.data.content}.mp4`;
        this.video.querySelector('track').src = `${CONTENT_BASE_URL}${response.data.content}.vtt`;
        this.video.load();
        break;
      default:
        console.error(`Undefined message type detected: ${response.type}`);
        return;
    }
  }

  protected forcePause(): Promise<void> {
    return super.forcePause();
  }
}

async function onLoad() {
  const continueContainer = document.getElementById('continueContainer');
  const video: HTMLVideoElement = <HTMLVideoElement>document.getElementById("video");

  continueContainer.classList.add('d-none');
  const startTime = new Promise<number>(resolve => {
    const lastSavedTime = Number(VideoController.getData("time"));
    const lastSavedDuration = Number(VideoController.getData("duration"));
    video.addEventListener("loadedmetadata", e => {
      if (lastSavedTime && Math.abs(lastSavedDuration - video.duration) < 0.5) {
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
    });
  });

  const socket = await setupWebSocket(false);

  const toast = document.getElementById('toast');
  new VideoSenderController(video, socket, toast, 0);
  startTime.then(time => {
    video.currentTime = time;
    continueContainer.classList.add('d-none');
    VideoController.setData('duration', video.duration.toString());
  });
  video.removeAttribute('disabled');
}

window.addEventListener('load', () => {
  onLoad().catch(console.error);
});
