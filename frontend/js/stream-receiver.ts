import {
  setupWebSocket,
  MESSAGE_TYPES
} from './common'

enum VideoEvent {
  play = 'play',
  pause = 'pause',
  seeking = 'seeking',
  seeked = 'seeked'
};

type VideoCallbacks = {
  [name in VideoEvent]?: (this: GlobalEventHandlers, ev: Event) => any;
};

class VideoController {
  private video: HTMLVideoElement;
  private socket: WebSocket;
  private callbacks: VideoCallbacks = {};
  private isReady: boolean = false;
  constructor(video: HTMLVideoElement, socket: WebSocket) {
    this.video = video;

    this.socket = socket;

    this.video.play().then(this.onReady.bind(this));

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
          this.video.pause();
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

  private onReady() {
    console.log("Playback ready");
    this.forcePause();
    this.isReady = true;
    this.socket.send(JSON.stringify({
      'type': MESSAGE_TYPES.READY
    }));
  }

  private setVideoEvent(type: VideoEvent, callback: (this: GlobalEventHandlers, ev: Event) => any) {
    this.video.removeEventListener(type, this.callbacks[type]);
    this.callbacks[type] = callback;
    this.video.addEventListener(type, this.callbacks[type]);
  }

  private forcePause() {
    console.log("Forcing pause");
    this.video.removeEventListener(VideoEvent.pause, this.callbacks.pause);
    this.video.pause();
    this.video.addEventListener(VideoEvent.pause, this.callbacks.pause);
  }

  private forcePlay() {
    console.log("Forcing play");
    this.video.removeEventListener(VideoEvent.play, this.callbacks.play);
    this.video.play().then(() => {
      this.video.addEventListener(VideoEvent.play, this.callbacks.play);
    });
  }

  private forceSeek(time: number) {
    console.log("Forcing seek to: " + time);
    this.video.removeEventListener(VideoEvent.seeking, this.callbacks.seeking);
    this.video.currentTime = time;
    this.setVideoEvent(VideoEvent.seeked, () => {
      this.video.addEventListener(VideoEvent.seeking, this.callbacks.seeking);
    });
  }
}

window.addEventListener('load', () => {
  const video: HTMLVideoElement = <HTMLVideoElement>document.getElementById("video");

  setupWebSocket(true).then(socket => {
    (<HTMLButtonElement>document.getElementById('begin')).addEventListener('click', e => {
      new VideoController(video, socket);
      (<HTMLButtonElement>e.target).style.display = "none";
    });
  });
});
