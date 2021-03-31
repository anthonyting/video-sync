import { BufferError } from "./errors";

export async function setupWebSocket(isViewer: boolean): Promise<WebSocket> {
  const socket: WebSocket = new WebSocket(WEBSOCKET_SERVER + (isViewer ? '?isViewer=true' : ''));

  const socketPromise: Promise<WebSocket> = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => {
      console.log("Connected to websocket");
      resolve(socket);
    });
    socket.addEventListener('error', error => {
      reject(error);
    });
  });

  return socketPromise;
}

export const enum MessageTypes {
  RECONNECT = 'reconnect',
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  REQUEST = 'request',
  DISPATCH = 'dispatch',
  RESPOND = 'respond',
  TIME = 'time',
  TERMINATE = 'terminate',
  SETUP = 'setup',
  CHECK = 'check'
};

export const enum VideoEvent {
  play = 'play',
  playing = 'playing',
  pause = 'pause',
  seeking = 'seeking',
  seeked = 'seeked',
  waiting = 'waiting'
};

export type VideoCallbacks = {
  [name in VideoEvent]?: (ev: Event) => any;
};

type SocketCallbacks = {
  close?: (ev: CloseEvent) => any,
  open?: (ev: Event) => any,
  error?: (ev: Event) => any
}

const enum SocketEvent {
  close = 'close',
  open = 'open',
  error = 'error'
}

export class Notification {
  private toast: bootstrap.Toast;
  private toastElement: HTMLElement;
  private toastBody: HTMLElement;
  constructor(toastElement: HTMLElement) {
    this.toastElement = toastElement;
    this.toastBody = this.toastElement.querySelector('.toast-body');
    this.toast = new bootstrap.Toast(toastElement, {
      autohide: false
    });
  }

  /**
   * 
   * @param message 
   * @param delay if < 0, then do not hide
   */
  show(message: string, delay = 2500) {
    this.toast.show();
    this.toastBody.textContent = message;
    if (delay > 0) {
      setTimeout(() => {
        this.toast.hide();
      }, delay);
    }
  }

  hide() {
    this.toast.hide();
  }
}

export async function fetchJson(input: RequestInfo, init: RequestInit = null) {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw await response.json();
  }

  return response.json();
}

export abstract class VideoController {
  protected video: HTMLVideoElement;
  protected socket: WebSocket;
  protected callbacks: VideoCallbacks = {};
  private socketCallbacks: SocketCallbacks = {};
  /** Time delta between server and host in ms */
  protected serverTimeDelta: number = null;
  private doneBuffering: Promise<void> = null;
  private doneBufferingResolver: () => any;
  private isVideoPlaying: boolean = false;
  private static readonly storagePrefix: string = "VideoController_";
  private isViewer: boolean;
  private notification: Notification;
  private qualityElement: HTMLButtonElement;
  private isHighQuality: boolean = true;
  private isChangingQuality: boolean;
  private videoState: VideoEvent.playing | VideoEvent.pause = null;
  protected timeSpentSeeking: Promise<number> = Promise.resolve(0);
  protected isSeeking: boolean = false;
  constructor(video: HTMLVideoElement, socket: WebSocket, toastElement: HTMLElement, isViewer: boolean) {
    this.isViewer = isViewer;
    this.video = video;
    this.socket = socket;
    this.notification = new Notification(toastElement);
    window.addEventListener('offline', e => {
      this.showNotification("Your internet disconnected");
    });

    window.addEventListener('online', e => {
      this.showNotification("Your internet reconnected");
    });

    const maxDifference = 2; // seconds
    let time = 0;
    video.addEventListener('timeupdate', () => {
      const difference = Math.abs(video.currentTime - time);
      if (difference > maxDifference) {
        time = video.currentTime;
        VideoController.setData('time', time.toString());
      }
    });

    let i = 0;
    video.addEventListener(VideoEvent.waiting, () => {
      if (!this.isVideoPlaying) {
        const j = i++;
        console.log("Waiting for buffering to finish: " + j);
        this.doneBuffering = new Promise((resolve, reject) => {
          const maxBufferTime = 5000;
          this.doneBufferingResolver = resolve;
          setTimeout(() => {
            if (!video.paused && !this.isVideoPlaying) {
              reject(new BufferError("Failed to resolve buffer after 5 seconds", j, maxBufferTime));
            }
          }, maxBufferTime);
        });
      }
    });

    video.addEventListener(VideoEvent.playing, () => {
      this.videoState = VideoEvent.playing;
      this.isVideoPlaying = true;
      if (this.doneBufferingResolver) {
        this.doneBufferingResolver();
      }
    });

    video.addEventListener(VideoEvent.pause, () => {
      this.videoState = VideoEvent.pause;
    });

    video.addEventListener(VideoEvent.seeking, () => {
      this.isSeeking = true;
    });

    video.addEventListener(VideoEvent.seeked, () => {
      this.isSeeking = false;
    });

    this.socket.addEventListener('message', this.socketMessageWrapper.bind(this));

    this.setupReconnectFallback();

    this.qualityElement = <HTMLButtonElement>document.getElementById('quality');
    const source = video.querySelector('source').src;
    fetch((source.substring(0, source.lastIndexOf('.')) || source) + "-720.mp4", {
      method: 'HEAD'
    })
      .then(json => {
        if (json.ok) {
          this.qualityElement.classList.remove("d-none");
          this.qualityElement.addEventListener('click', this.onQualityChange.bind(this));
        }
      })
      .catch(console.error);
  }

  protected getState() {
    return this.videoState;
  }

  protected onQualityChange() {
    if (this.isChangingQuality) {
      return;
    }
    this.isChangingQuality = true;

    this.video.pause();
    const previousTime = this.video.currentTime;
    this.video.src = `https://${SITE_URL}/test/video${this.isHighQuality ? "-720" : ""}.mp4`;
    const onVideoLoad = () => {
      this.video.currentTime = previousTime;
      this.video.removeEventListener('loadeddata', onVideoLoad);
      this.isHighQuality = !this.isHighQuality;
      this.isChangingQuality = false;
      this.qualityElement.textContent = this.isHighQuality ? "Decrease Quality" : "Increase Quality";
    };
    this.video.addEventListener('loadeddata', onVideoLoad);
  }

  protected async onSocketMessage(message: MessageEvent<any>) {
    const response: {
      timestamp: number;
      data: any;
      type: MessageTypes
    } = JSON.parse(message.data);
    if (response.type === MessageTypes.TIME) {
      this.assignTimeDelta(response.data.requestSentAt, response.timestamp, response.data.responseSentAt, Date.now());
    }
  }

  protected enableVideoInteraction() {
    this.video.removeAttribute('disabled');
  }

  protected disableVideoInteraction() {
    this.video.setAttribute('disabled', '');
  }

  protected forceCloseSocket() {
    console.log("Socket forcibly closed");
    this.socket.removeEventListener(SocketEvent.close, this.socketCallbacks.close);
    this.socket.close();
  }

  private socketMessageWrapper(message: MessageEvent<any>) {
    this.onSocketMessage(message).catch(this.onError.bind(this));
  }

  private setupReconnectFallback() {
    this.socketCallbacks.close = e => {
      console.warn(`Socket closed: ${e.code} ${e.reason}`);
      this.showNotification("Your server connection has disconnected");
      const MAX_ATTEMPTS = 20;
      const TIME_BETWEEN_ATTEMPTS = 5000; // ms
      let attempts = 0;
      const retryInterval = setInterval(() => {
        if (++attempts <= MAX_ATTEMPTS) {
          setupWebSocket(this.isViewer)
            .then(socket => {
              this.showNotification(`Your server connection has reconnected after ${attempts} attempt${attempts > 1 ? 's' : ''}.`);
              this.socket = socket;
              this.socket.addEventListener('message', this.socketMessageWrapper.bind(this));
              this.setupReconnectFallback();
              clearInterval(retryInterval);
            })
            .catch(err => {
              console.warn(`Error connecting to socket. Attempt ${attempts}/${MAX_ATTEMPTS}.`, err);
            });
        } else {
          this.showNotification(`Failed to connect to the server after ${MAX_ATTEMPTS} attempts.`, -1);
          clearInterval(retryInterval);
        }
      }, TIME_BETWEEN_ATTEMPTS);
    };

    this.socket.addEventListener(SocketEvent.close, this.socketCallbacks.close);
  }

  protected waitForBuffering() {
    return this.doneBuffering;
  }

  protected hideNotification() {
    this.notification.hide();
  }

  protected showNotification(message: string, delay = 2500) {
    this.notification.show(message, delay);
  }

  protected onError(err: any) {
    console.error(err);
    this.notification.show(err.message ? err.message : err);
  }

  protected assignTimeDelta(requestSentAt: number, requestReceivedAt: number, responseSentAt: number, responseReceivedAt: number): void {
    // based on https://en.wikipedia.org/wiki/Network_Time_Protocol#Clock_synchronization_algorithm
    this.serverTimeDelta = ((requestReceivedAt - requestSentAt) + (responseReceivedAt - responseSentAt)) / 2;
    if (isNaN(this.serverTimeDelta)) {
      throw new TypeError(`Server time delta failed to initialize`);
    }

    console.log(`Synchronizing clock to delta of ${this.serverTimeDelta}ms`);
  }

  protected syncTime(): void {
    this.socket.send(JSON.stringify({
      type: MessageTypes.TIME,
      timestamp: Date.now()
    }));
  }

  protected getRealTime(): number {
    if (this.serverTimeDelta === null || isNaN(this.serverTimeDelta)) {
      throw new TypeError("Server time delta not yet initialized");
    }
    return Date.now() + this.serverTimeDelta;
  }

  protected reconnect() {
    console.log("Playback reconnected");
    this.showNotification("Connecting to host...");
  }

  protected setVideoEvent(type: VideoEvent, callback: (ev: Event) => any) {
    this.video.removeEventListener(type, this.callbacks[type]);
    this.callbacks[type] = callback;
    this.video.addEventListener(type, this.callbacks[type]);
  }

  protected forcePause(): Promise<void> {
    console.log("Forcing pause");
    this.video.removeEventListener(VideoEvent.pause, this.callbacks.pause);
    this.video.pause();
    return new Promise(resolve => {
      setTimeout(() => {
        // https://html.spec.whatwg.org/multipage/media.html#event-media-pause
        // If not in a setTimeout(), addEventListener fires even though pause() returns before
        // (tested in Firefox and Chrome). Seems like they implement the spec incorrectly?
        this.video.addEventListener(VideoEvent.pause, this.callbacks.pause);
        resolve();
      }, 0);
    });
  }

  protected forcePlay(): Promise<void> {
    console.log("Forcing play");
    this.video.removeEventListener(VideoEvent.play, this.callbacks.play);
    return this.video.play().finally(() => {
      this.video.addEventListener(VideoEvent.play, this.callbacks.play);
    });
  }

  protected forceSeek(time: number) {
    console.log("Forcing seek to: " + time);
    this.video.removeEventListener(VideoEvent.seeking, this.callbacks.seeking);
    const now = Date.now();
    this.video.currentTime = time;
    this.timeSpentSeeking = new Promise(resolve => {
      this.setVideoEvent(VideoEvent.seeked, () => {
        this.video.addEventListener(VideoEvent.seeking, this.callbacks.seeking);
        resolve(Date.now() - now);
      });
    });
    return this.timeSpentSeeking;
  }

  public static setData(key: string, value: string) {
    return window.localStorage.setItem(VideoController.storagePrefix + key, value);
  }

  public static getData(key: string) {
    return window.localStorage.getItem(VideoController.storagePrefix + key);
  }
}
