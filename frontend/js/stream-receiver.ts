import {
  setupWebSocket,
  MessageTypes,
  VideoController,
  VideoEvent,
} from './common'

class VideoReceiverController extends VideoController {
  private maximumSeekPosition: number = 0;
  private hostDisconnected: boolean = false;
  constructor(video: HTMLVideoElement, socket: WebSocket, toast: HTMLElement) {
    super(video, socket, toast, true);

    this.setVideoEvent(VideoEvent.seeking, () => {
      console.log("User seeking manually");
      if (video.currentTime - 0.5 > this.maximumSeekPosition) {
        this.showNotification("Seeking is disabled");
        this.forceSeek(this.maximumSeekPosition);
        this.reconnect();
      }
    });

    this.setVideoEvent(VideoEvent.seeked, () => {
      if (video.currentTime - 0.5 > this.maximumSeekPosition) {
        console.log("User seeked manually");
        this.showNotification("Seeking is disabled");
        this.forceSeek(this.maximumSeekPosition);
        this.reconnect();
      }
    });

    this.setVideoEvent(VideoEvent.play, () => {
      console.log("User attempting to play manually");
      this.forcePause();
      this.showNotification("Wait for the host to start the video");
      this.forceSeek(this.maximumSeekPosition);
    });

    this.setVideoEvent(VideoEvent.pause, () => {
      console.log("User paused manually");
      this.showNotification("Click play again to catch up automatically");
      this.setVideoEvent(VideoEvent.play, () => {
        this.showNotification("Reconnecting...");
        this.disableVideoInteraction();
        this.reconnect();
      });
    });

    this.forcePlay().then(() => {
      this.forcePause();
      this.reconnect();
    }).catch(err => {
      console.error(err);
      this.showNotification(err.message);
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
      // fall through
      case MessageTypes.DISPATCH:
        switch (response.request) {
          case VideoEvent.pause:
          // fall through
          case VideoEvent.seeking:
            this.forcePause();
            this.forceSeek(response.time);
            this.maximumSeekPosition = response.time;
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
                this.forceSeek(this.video.currentTime + (bufferAdjustment / 1000));
                this.maximumSeekPosition = Math.max(response.time, this.video.currentTime);
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
        this.showNotification("Your connection has been closed");
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
  video.addEventListener(VideoEvent.seeked, resetPlayer)
  setupWebSocket(true)
    .then(socket => {
      video.removeEventListener(VideoEvent.play, video.pause);
      video.removeEventListener(VideoEvent.seeked, resetPlayer);

      const toast = document.getElementById('toast');
      new VideoReceiverController(video, socket, toast);
      video.removeAttribute('disabled');
    })
    .catch(console.error);
});
