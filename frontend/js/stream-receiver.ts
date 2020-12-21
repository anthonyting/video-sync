import {
  setupWebSocket,
  MessageTypes,
  VideoController,
  VideoEvent
} from './common'

class VideoReceiverController extends VideoController {
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
      } = JSON.parse(e.data);

      console.log("Received socket response: ", response);

      const startTime: number = Date.now();
      new Promise<void>(resolve => {
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
      }).then(() => {
        const difference: number = Date.now() - startTime;
        console.log(`Time adjustment: ${difference}ms`);
        this.forceSeek(response['time'] + (difference / 1000));
      });
    });
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
        new VideoReceiverController(video, socket);
        (<HTMLButtonElement>e.target).style.display = "none";
      });
    })
    .catch(console.error);
});
