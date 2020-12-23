import {
  setupWebSocket,
  MessageTypes,
  VideoController,
  VideoEvent,
} from './common'

class VideoReceiverController extends VideoController {
  constructor(video: HTMLVideoElement, socket: WebSocket, toast: HTMLElement) {
    super(video, socket, toast);

    let videoTime = 0;
    this.video.addEventListener('timeupdate', () => {
      if (!video.seeking) {
        videoTime = video.currentTime;
      }
    });

    this.setVideoEvent(VideoEvent.seeking, () => {
      console.log("User attempting to seek manually");
      const delta = video.currentTime - videoTime;
      if (Math.abs(delta) > 0.01) {
        this.showNotification("Seeking is disabled");
        this.forceSeek(videoTime);
      }
    });

    this.setVideoEvent(VideoEvent.play, () => {
      console.log("User attempting to play manually");
      this.forcePause();
      this.showNotification("Wait for the broadcaster to start the video");
      this.forceSeek(videoTime);
    });

    this.setVideoEvent(VideoEvent.pause, () => {
      console.log("User paused manually");
      this.setVideoEvent(VideoEvent.play, () => {
        this.onReconnect();
      });
    });

    this.video.play().then(this.onReconnect.bind(this));

    this.socket.addEventListener('message', e => {
      const response: {
        time: number;
        timestamp: number;
        request: VideoEvent;
        type: MessageTypes;
        data: any
      } = JSON.parse(e.data);

      console.log("Received socket response: ", response);

      new Promise<void>(resolve => {
        switch (response.type) {
          case MessageTypes.RESPOND:
          // fall through
          case MessageTypes.DISPATCH:
            switch (response.request) {
              case VideoEvent.pause:
              // fall through
              case VideoEvent.seeking:
                this.forcePause();
                resolve();
                break;
              case VideoEvent.play:
                this.forcePlay().then(resolve);
                break;
              default:
                console.error(`Request response not found: ${response.request}`);
                resolve();
            }
            break;
          case MessageTypes.TIME:
            this.assignTimeDelta(response.timestamp, response.data.sentAt);
            break;
          default:
            console.error(`Undefined message type detected: ${response.type}`);
            return;
        }
      }).then(() => {
        const difference: number = this.getRealTime() - response.timestamp;
        console.log(`Time adjustment: ${difference}ms`);
        if (response['time'] === 0) {
          this.forceSeek(response['time']);
        } else {
          this.forceSeek(response['time'] + (difference / 1000));
        }
      }).catch(err => {
        console.error(err);
        this.showNotification(`An error occurred: ${err.message}`);
      });
    });

    this.syncTime();
  }

  protected onReconnect() {
    super.onReconnect();
    this.forcePause();
    this.socket.send(JSON.stringify({
      'type': MessageTypes.RECONNECT
    }));
  }
}

window.addEventListener('load', () => {
  const video: HTMLVideoElement = <HTMLVideoElement>document.getElementById("video");

  setupWebSocket(true)
    .then(socket => {
      (<HTMLButtonElement>document.getElementById('begin')).addEventListener('click', e => {
        const toast = document.getElementById('toast');
        new VideoReceiverController(video, socket, toast);
        (<HTMLButtonElement>e.target).style.display = "none";
      });
    })
    .catch(console.error);
});
