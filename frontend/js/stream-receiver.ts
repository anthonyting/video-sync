import {
  setupWebSocket,
  MessageTypes,
  VideoController,
  VideoEvent,
} from './common'

class VideoReceiverController extends VideoController {
  private hostDisconnected: boolean = false;
  /** Used when browser does not allow autoplay */
  private reconnectOnPlay: boolean = false;
  private maximumSeekPosition: number = 0;
  constructor(video: HTMLVideoElement, socket: WebSocket, toast: HTMLElement) {
    super(video, socket, toast, true);

    // this.setVideoEvent(VideoEvent.seeking, () => {
    //   console.log("User seeking manually");
    //   if (video.currentTime - 1 > this.maximumSeekPosition) {
    //     this.showNotification("Seeking is disabled");
    //     this.forceSeek(this.maximumSeekPosition);
    //     this.reconnect();
    //   }
    // });

    // this.video.addEventListener(VideoEvent.seeked, () => {
    //   if (video.currentTime - 1 >= this.maximumSeekPosition) {
    //     console.log("User seeked manually");
    //     this.forceSeek(this.maximumSeekPosition);
    //     this.reconnect();
    //   }
    // });

    // this.setVideoEvent(VideoEvent.play, () => {
    //   if (this.reconnectOnPlay) {
    //     this.reconnectOnPlay = false;
    //     this.reconnect();
    //   } else {
    //     console.log("User attempting to play manually");
    //     this.forcePause();
    //     this.showNotification("Wait for the host to start the video");
    //     this.forceSeek(this.maximumSeekPosition);
    //   }
    // });

    // this.setVideoEvent(VideoEvent.pause, () => {
    //   if (this.video.duration === this.video.currentTime) {
    //     this.showNotification("Video ended");
    //   } else {
    //     console.log("User paused manually");
    //     this.showNotification("Click play again to catch up automatically");
    //     this.setVideoEvent(VideoEvent.play, () => {
    //       this.disableVideoInteraction();
    //       this.reconnect();
    //     });
    //   }
    // });

    if (this.video.readyState !== 0) {
      this.forcePlay().then(() => {
        this.reconnect();
      }).catch(err => {
        console.error(err);
        this.reconnectOnPlay = true;
      });
    } else {
      this.video.addEventListener('loadedmetadata', () => {
        this.forcePlay().finally(() => {
          this.reconnect();
        }).catch(err => {
          console.error(err);
          this.reconnectOnPlay = true;
        });
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

  protected async onSocketMessage(message: MessageEvent<any>) {
    await super.onSocketMessage(message);

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
        // this.showNotification("Connected to host.");
        // fall through
      case MessageTypes.DISPATCH:
        await this.invokeState(response.request, response, responseReceivedAt);
        break;
      case MessageTypes.TIME:
        break;
      case MessageTypes.DISCONNECT:
        // this.showNotification("The host disconnected. Wait for them to reconnect.");
        this.hostDisconnected = true;
        await this.forcePause();
        break;
      case MessageTypes.CONNECT:
        if (this.hostDisconnected) {
          // this.showNotification("The host has connected. Wait for them to start playing");
          this.hostDisconnected = false;
        }
        break;
      case MessageTypes.TERMINATE:
        this.showNotification("Your connection has been terminated by the host", -1);
        await this.forcePause();
        this.disableVideoInteraction();
        this.forceCloseSocket();
        break;
      case MessageTypes.SETUP:
        await this.forcePause();
        this.video.querySelector('source').src = `${CONTENT_BASE_URL}${response.data.content}.mp4`;
        this.video.querySelector('track').src = `${CONTENT_BASE_URL}${response.data.content}.vtt`;
        this.video.load();
        this.reconnect();
        break;
      case MessageTypes.CHECK:
        if (response.request !== this.getState()) {
          console.log("State mismatch, synchronizing...");
          this.invokeState(response.request, response, responseReceivedAt);
        }
        break;
      default:
        console.error(`Undefined message type detected: ${response.type}`);
        return;
    }
  }

  protected reconnect() {
    super.reconnect();
    this.forcePause().then(() => {
      this.socket.send(JSON.stringify({
        'type': MessageTypes.RECONNECT
      }));
    });
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
