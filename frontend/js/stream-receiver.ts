import {
  setupWebSocket,
  MessageTypes,
  VideoController,
  VideoEvent,
} from './common'

class VideoReceiverController extends VideoController {
  private maximumSeekPosition: number = 0;
  private hostDisconnected: boolean = false;
  /** Used when browser does not allow autoplay */
  private reconnectOnPlay: boolean = false;
  constructor(video: HTMLVideoElement, socket: WebSocket, toast: HTMLElement) {
    super(video, socket, toast, true);

    this.setVideoEvent(VideoEvent.seeking, () => {
      console.log("User seeking manually");
      if (video.currentTime - 1 > this.maximumSeekPosition) {
        this.showNotification("Seeking is disabled");
        this.forceSeek(this.maximumSeekPosition);
        this.reconnect();
      }
    });

    this.video.addEventListener(VideoEvent.seeked, () => {
      if (video.currentTime - 1 >= this.maximumSeekPosition) {
        console.log("User seeked manually");
        this.forceSeek(this.maximumSeekPosition);
        this.reconnect();
      }
    });

    this.setVideoEvent(VideoEvent.play, () => {
      if (this.reconnectOnPlay) {
        this.reconnectOnPlay = false;
        this.reconnect();
      } else {
        console.log("User attempting to play manually");
        this.forcePause();
        this.showNotification("Wait for the host to start the video");
        this.forceSeek(this.maximumSeekPosition);
      }
    });

    this.setVideoEvent(VideoEvent.pause, () => {
      console.log("User paused manually");
      this.showNotification("Click play again to catch up automatically");
      this.setVideoEvent(VideoEvent.play, () => {
        this.disableVideoInteraction();
        this.reconnect();
      });
    });

    this.forcePlay().then(() => {
      this.reconnect();
    }).catch(err => {
      console.error(err);
      this.reconnectOnPlay = true;
    });

    this.syncTime();
  }

  protected onSocketMessage(message: MessageEvent<any>) {
    super.onSocketMessage(message);

    const responseReceivedAt = Date.now();

    const response: {
      time: number;
      timestamp: number;
      request: VideoEvent;
      type: MessageTypes;
      data: any
    } = JSON.parse(message.data);

    console.log("Received socket response: ", response);

    switch (response.type) {
      case MessageTypes.RESPOND:
        this.showNotification("Connected");
        // fall through
      case MessageTypes.DISPATCH:
        switch (response.request) {
          case VideoEvent.pause:
          // fall through
          case VideoEvent.seeking:
            this.maximumSeekPosition = response.time;
            this.forcePause();
            this.forceSeek(response.time);
            break;
          case VideoEvent.play: {
            const difference: number = this.getRealTime() - response.timestamp;
            console.log(`Latency adjustment: ${difference}ms`);
            if (response.time === 0) {
              this.forceSeek(response.time);
            } else {
              this.forceSeek(response.time + (difference / 1000));
            }
            this.forcePlay()
              .then(() => this.waitForBuffering())
              .catch(console.warn)
              .finally(() => {
                const bufferAdjustment = Date.now() - responseReceivedAt + 25;
                console.log(`Buffer adjustment: ${bufferAdjustment}ms`);
                this.maximumSeekPosition = Math.max(response.time, this.video.currentTime);
                this.forceSeek(this.video.currentTime + (bufferAdjustment / 1000));
                this.maximumSeekPosition = Math.max(this.maximumSeekPosition, this.video.currentTime);
                this.enableVideoInteraction();
              });
            break;
          }
          default:
            console.error(`Request response not found: ${response.request}`);
        }
        break;
      case MessageTypes.TIME:
        break;
      case MessageTypes.DISCONNECT:
        this.showNotification("The host disconnected. Wait for them to reconnect.");
        this.hostDisconnected = true;
        this.forcePause();
        break;
      case MessageTypes.CONNECT:
        if (this.hostDisconnected) {
          this.showNotification("The host has connected. Wait for them to start playing");
          this.hostDisconnected = false;
        }
        break;
      case MessageTypes.TERMINATE:
        this.showNotification("Your connection has been terminated by the host", -1);
        this.forcePause();
        this.disableVideoInteraction();
        this.forceCloseSocket();
        break;
      default:
        console.error(`Undefined message type detected: ${response.type}`);
        return;
    }
  }

  protected reconnect() {
    super.reconnect();
    this.forcePause();
    this.socket.send(JSON.stringify({
      'type': MessageTypes.RECONNECT
    }));
  }
}

window.addEventListener('load', () => {
  const video: HTMLVideoElement = <HTMLVideoElement>document.getElementById("video");
  const resetPlayer = () => video.currentTime = 0;

  video.addEventListener(VideoEvent.play, video.pause);
  video.addEventListener(VideoEvent.seeked, resetPlayer);
  const videoLoaded = new Promise<void>(resolve => {
    const onLoadedData = () => {
      resolve();
      video.removeEventListener('loadeddata', onLoadedData);
    }
    video.addEventListener('loadeddata', onLoadedData);
  });
  Promise.all([
    setupWebSocket(true),
    videoLoaded
  ]).then(([socket]) => {
    video.removeEventListener(VideoEvent.play, video.pause);
    video.removeEventListener(VideoEvent.seeked, resetPlayer);

    const toast = document.getElementById('toast');
    new VideoReceiverController(video, socket, toast);
    video.removeAttribute('disabled');
  }).catch(console.error);
});
