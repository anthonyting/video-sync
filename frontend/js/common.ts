export async function setupWebSocket(isViewer: boolean): Promise<WebSocket> {
  const socket: WebSocket = new WebSocket(WEBSOCKET_SERVER + (isViewer ? '?isViewer=true' : ''));

  const socketPromise: Promise<WebSocket> = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => {
      console.log("Connected to websocket");
      resolve(socket);
    });
    socket.addEventListener('error', error => {
      console.error("Error connecting to websocket: ", error)
      reject(error);
    });
  });

  return socketPromise;
}

export enum MessageTypes {
  RECONNECT = 'reconnect',
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  REQUEST = 'request',
  DISPATCH = 'dispatch',
  RESPOND = 'respond',
  TIME = 'time',
};

export enum VideoEvent {
  play = 'play',
  playing = 'playing',
  pause = 'pause',
  seeking = 'seeking',
  seeked = 'seeked'
};

export type VideoCallbacks = {
  [name in VideoEvent]?: (ev: Event) => any;
};

export abstract class VideoController {
  protected video: HTMLVideoElement;
  protected socket: WebSocket;
  protected callbacks: VideoCallbacks = {};
  /** Time delta between server and host in ms */
  protected serverTimeDelta: number = null;
  private toast: Bootstrap.Toast;
  private toastElement: HTMLElement;
  constructor(video: HTMLVideoElement, socket: WebSocket, toast: HTMLElement) {
    this.video = video;
    this.socket = socket;
    this.toastElement = toast;
    // @ts-ignore bootstrap types not up to date
    this.toast = new Bootstrap.Toast(toast, {
      delay: 1000
    });
  }

  protected showNotification(message: string) {
    // @ts-ignore
    this.toast.show();
    this.toastElement.querySelector('.toast-body').textContent = message;
  }

  protected syncTime(): void {
    this.socket.send(JSON.stringify({
      type: MessageTypes.TIME,
      timestamp: Date.now()
    }));
  }

  protected getRealTime(): number {
    if (this.serverTimeDelta === null) {
      throw new TypeError("Server time delta not yet initialized");
    }
    return Date.now() + this.serverTimeDelta;
  }

  protected onReconnect() {
    console.log("Playback reconnected");
  }

  protected setVideoEvent(type: VideoEvent, callback: (ev: Event) => any) {
    this.video.removeEventListener(type, this.callbacks[type]);
    this.callbacks[type] = callback;
    this.video.addEventListener(type, this.callbacks[type]);
  }

  protected forcePause() {
    console.log("Forcing pause");
    this.video.removeEventListener(VideoEvent.pause, this.callbacks.pause);
    this.video.pause();
    setTimeout(() => {
      // https://html.spec.whatwg.org/multipage/media.html#event-media-pause
      // If not in a setTimeout(), addEventListener fires even though pause() returns before
      // (tested in Firefox and Chrome). Seems like they implement the spec incorrectly?
      this.video.addEventListener(VideoEvent.pause, this.callbacks.pause);
    }, 0);
  }

  protected forcePlay(): Promise<void> {
    console.log("Forcing play");
    this.video.removeEventListener(VideoEvent.play, this.callbacks.play);
    return this.video.play().catch(console.error).finally(() => {
      this.video.addEventListener(VideoEvent.play, this.callbacks.play);
    });
  }

  protected forceSeek(time: number) {
    console.log("Forcing seek to: " + time);
    this.video.removeEventListener(VideoEvent.seeking, this.callbacks.seeking);
    this.video.currentTime = time;
    this.setVideoEvent(VideoEvent.seeked, () => {
      this.video.addEventListener(VideoEvent.seeking, this.callbacks.seeking);
    });
  }
}
