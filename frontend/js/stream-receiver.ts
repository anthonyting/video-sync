import {
  setupWebSocket,
  MessageTypes,
  VideoController,
  VideoEvent,
} from './common'

class VideoReceiverController extends VideoController {
  private minimumTime: number = 0;
  constructor(video: HTMLVideoElement, socket: WebSocket, toast: HTMLElement) {
    super(video, socket, toast);

    this.setVideoEvent(VideoEvent.seeking, () => {
      console.log("User seeking manually");
      if (video.currentTime > this.minimumTime) {
        this.showNotification("Seeking is disabled");
        this.forceSeek(this.minimumTime);
      }
    });

    video.addEventListener(VideoEvent.seeked, () => {
      console.log("User seeked");
      if (video.currentTime - 0.5 > this.minimumTime) {
        this.showNotification("Seeking is disabled");
        this.forceSeek(this.minimumTime);
      }
    });

    this.setVideoEvent(VideoEvent.play, () => {
      console.log("User attempting to play manually");
      this.forcePause();
      this.showNotification("Wait for the broadcaster to start the video");
      this.forceSeek(this.minimumTime);
    });

    this.setVideoEvent(VideoEvent.pause, () => {
      console.log("User paused manually");
      this.setVideoEvent(VideoEvent.play, () => {
        this.onReconnect();
      });
    });

    this.video.play().then(this.onReconnect.bind(this));

    this.socket.addEventListener('message', e => {
      const responseReceivedAt = Date.now();

      const response: {
        time: number;
        timestamp: number;
        request: VideoEvent;
        type: MessageTypes;
        data: any
      } = JSON.parse(e.data);

      console.log("Received socket response: ", response);

      new Promise<number | void>(resolve => {
        switch (response.type) {
          case MessageTypes.RESPOND:
          // fall through
          case MessageTypes.DISPATCH:
            switch (response.request) {
              case VideoEvent.pause:
              // fall through
              case VideoEvent.seeking:
                this.forcePause();
                resolve(response.time);
                break;
              case VideoEvent.play: {
                const difference: number = this.getRealTime() - response.timestamp;
                console.log(`Latency adjustment: ${difference}ms`);
                if (response.time === 0) {
                  this.forceSeek(response.time);
                } else {
                  this.forceSeek(response.time + (difference / 1000));
                }
                this.forcePlay().then(() => this.waitForBuffering()).catch(console.warn).finally(resolve);
                break;
              }
              default:
                console.error(`Request response not found: ${response.request}`);
                resolve();
            }
            break;
          case MessageTypes.TIME:
            this.assignTimeDelta(response.data.requestSentAt, response.timestamp, response.data.responseSentAt, Date.now());
            break;
          default:
            console.error(`Undefined message type detected: ${response.type}`);
            return;
        }
      }).then(value => {
        const bufferAdjustment = Date.now() - responseReceivedAt;
        console.log(`Buffer adjustment: ${bufferAdjustment}ms`);
        const seekedValue = (value ? value : video.currentTime) + (bufferAdjustment / 1000);
        this.forceSeek(seekedValue);
        this.minimumTime = Math.max(response.time, seekedValue);
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
