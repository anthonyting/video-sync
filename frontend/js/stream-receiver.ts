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

    if (this.video.readyState !== 0) {
      this.forcePlay().then(() => {
        this.reconnect();
      }).catch(err => {
        console.error(err);
        this.reconnectOnPlay = true;
      });
    }

    this.syncTime();
  }

  protected onQualityChange() {
    super.onQualityChange();
    const onVideoLoad = () => {
      this.reconnect();
      this.video.removeEventListener('loadeddata', onVideoLoad);
    };
    this.video.addEventListener('loadeddata', onVideoLoad);
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
        this.showNotification("Connected to host.");
      // fall through
      case MessageTypes.DISPATCH:
        const latencyAdjustment: number = this.getRealTime() - response.timestamp;
        const latencyAdjustedSeek = response.time + (latencyAdjustment / 1000);
        this.maximumSeekPosition = latencyAdjustedSeek;
        switch (response.request) {
          case VideoEvent.pause:
          // fall through
          case VideoEvent.seeking:
            this.forcePause();
            this.forceSeek(latencyAdjustedSeek);
            break;
          case VideoEvent.play: {
            console.log(`Latency adjustment: ${latencyAdjustment}ms`);
            if (response.time === 0) {
              this.forceSeek(response.time);
            } else {
              this.forceSeek(latencyAdjustedSeek);
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
      case MessageTypes.SETUP:
        this.forcePause();
        this.video.querySelector('source').src = `${BASEURL}/content/${response.data.content}.mp4`;
        this.video.querySelector('track').src = `${BASEURL}/content/${response.data.content}.vtt`;
        this.video.load();
        this.reconnect();
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
  setupWebSocket(true).then(socket => {
    VideoController.setData('duration', video.duration.toString());

    const toast = document.getElementById('toast');
    new VideoReceiverController(video, socket, toast);
    video.removeAttribute('disabled');
  }).catch(console.error);
});
