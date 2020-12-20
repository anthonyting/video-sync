import {
  setupWebSocket,
  MESSAGE_TYPES,
  VideoController,
  VideoEvent
} from './common'

class VideoReceiverController extends VideoController {
  private isReady: boolean = false;
  constructor(video: HTMLVideoElement, socket: WebSocket) {
    super(video, socket);

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
        alert("Seeking is disabled");
        this.forceSeek(videoTime);
      }
    });

    this.setVideoEvent(VideoEvent.play, () => {
      console.log("User attempting to play manually");
      this.forcePause();
      alert("Wait for the broadcaster to start the video");
      this.forceSeek(videoTime);
    });

    this.setVideoEvent(VideoEvent.pause, () => {
      console.log("User paused");
      this.setVideoEvent(VideoEvent.play, () => {
        this.onReady();
      });
    });

    this.video.play().then(this.onReady.bind(this));

    this.socket.addEventListener('message', e => {
      const response: {
        time: number;
        timestamp: number;
        ready: boolean;
        request: 'play' | 'pause' | 'seek';
      } = JSON.parse(e.data);

      console.log("Received socket response: ", response);

      switch (response['request']) {
        case 'pause':
          this.forcePause();
          break;
        case 'seek':
          this.setVideoEvent(VideoEvent.play, this.onReady.bind(this));
          break;
        case 'play':
          if (response['ready']) {
            this.forcePlay();
          } else {
            this.forcePause();
            if (this.isReady) {
              this.onReady();
            }
          }
          break;
        default:
          console.error("Request response not found: " + response['request']);
      }

      this.forceSeek(response['time']);
    });
  }

  protected onReady() {
    super.onReady();
    this.forcePause();
    this.isReady = true;
    this.socket.send(JSON.stringify({
      'type': MESSAGE_TYPES.READY
    }));
  }
}

window.addEventListener('load', () => {
  const video: HTMLVideoElement = <HTMLVideoElement>document.getElementById("video");

  setupWebSocket(true)
    .then(socket => {
      (<HTMLButtonElement>document.getElementById('begin')).addEventListener('click', e => {
        new VideoReceiverController(video, socket);
        (<HTMLButtonElement>e.target).style.display = "none";
      });
    })
    .catch(console.error);
});
