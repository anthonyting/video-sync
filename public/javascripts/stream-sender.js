'use strict'

window.onload = () => {
  /** @type {HTMLVideoElement} */
  const video = document.getElementById("video");

  /**
   * @returns {Promise<WebSocket>}
   */
  async function setupWebSocket() {
    const socket = new WebSocket('wss://' + window.location.host + "/abcde");

    const socketPromise = new Promise((resolve, reject) => {
      socket.onopen = () => {
        console.log("Connected to websocket");
        resolve(socket);
      };
      socket.onerror = error => {
        console.error("Error connecting to websocket: ", error)
        reject(error);
      };
    });

    return socketPromise;
  }

  /**
   * 
   * @param {boolean} ready 
   * @param {'play' | 'pause' | 'seek'} request
   */
  function getStringifiedVideoData(ready = false, request) {
    return JSON.stringify(getVideoData(ready, request));
  }

  function getVideoData(ready, request) {
    return {
      'time': video.currentTime,
      'timestamp': Math.floor(Date.now() / 1000),
      'request': request,
      'ready': ready
    };
  }

  /**
   * @enum
   */
  const MESSAGE_TYPES = {
    'READY': 'ready',
    'CONNECT': 'connect',
    'DISCONNECT': 'disconnect'
  };

  class PeerVideo {
    constructor() {
      /** @type {WebSocket} */
      this.socket = null;
      /** @type {HTMLVideoElement} */
      this.video = video;
      /** @type {Array<{id: string, ready: boolean}>} */
      this.peers = [];

      this.notifyPause = true;
      this.notifyPlay = true;

      this.pauseResolver = null;
      this.playResolver = null;

      this.played = new Promise(resolve => this.playResolver = resolve);
      this.paused = new Promise(resolve => this.pauseResolver = resolve);
    }

    resetPauseEventPromise() {
      this.pauseResolver = null;
      this.paused = new Promise(resolve => this.pauseResolver = resolve);
    }

    resetPlayEventPromise() {
      this.playResolver = null;
      this.played = new Promise(resolve => this.playResolver = resolve);
    }

    onPause() {
      this.socket.send(getStringifiedVideoData(false, 'pause'));
    }

    onPlay() {
      this.socket.send(getStringifiedVideoData(false, 'play'));
    }

    async pauseWithoutRequest() {
      return new Promise(resolve => {
        this.notifyPause = false;
        this.video.pause();
        this.paused.then(() => {
          this.notifyPause = true;
          this.resetPauseEventPromise();
          resolve(Date.now());
        });
      });
    }

    playWithoutRequest() {
      this.notifyPlay = false;
      this.video.play();
      this.played.then(() => {
        this.notifyPlay = true;
        this.resetPlayEventPromise();
      });
    }

    async setupListeners() {
      this.socket = await setupWebSocket();

      // respond to a message on new connnection
      this.socket.onmessage = (e) => {
        /**@type {{
         * type: 'ready' | 'connect',
         * id: string,
         * data: Object
         * }} */
        const data = JSON.parse(e.data);

        const id = data['id'];

        switch (data['type']) {
          case MESSAGE_TYPES.READY:
            console.log(new Date() + ": " + id + " is connected");
            let allReady = true;
            for (let i = 0; i < this.peers.length; i++) {
              if (this.peers[i].id === id) {
                this.peers[i].ready = true;
                allReady = allReady && i === this.peers.length - 1;
              } else {
                allReady = false;
              }
            }
            if (allReady) {
              this.playWithoutRequest();
              this.socket.send(getStringifiedVideoData(true, 'play'));
            }
            break;
          case MESSAGE_TYPES.CONNECT:
            console.log(new Date() + ": " + id + " is connecting");
            for (let i = 0; i < this.peers.length; i++) {
              if (this.peers[i].id === id) {
                this.peers[i].ready = false;
                break;
              }
            }
            video.pause();
            break;
          case MESSAGE_TYPES.DISCONNECT:
            console.log(new Date() + ": " + id + " disconnected");
            for (let i = 0; i < this.peers.length; i++) {
              if (this.peers[i].id === id) {
                this.peers.splice(i);
                break;
              }
            }
            break;
          default:
            console.error("Undefined message type detected: " + data['type']);
            return;
        }
      }

      this.video.onpause = (e) => {
        if (this.notifyPause) {
          this.socket.send(getStringifiedVideoData(false, 'pause'));
        }
        this.pauseResolver();
        this.resetPauseEventPromise();
      }

      this.video.onplaying = async (e) => {
        if (this.notifyPlay) {
          e.preventDefault();
          await this.pauseWithoutRequest();
          this.socket.send(getStringifiedVideoData(false, 'play'));
        }
        this.playResolver();
        this.resetPlayEventPromise();
      }

      this.video.onseeked = (e) => {
        e.preventDefault();
        this.pauseWithoutRequest();
        this.socket.send(getStringifiedVideoData(false, 'seek'));
      }
    }
  }

  document.getElementById('begin').addEventListener('click', e => {
    new PeerVideo().setupListeners();
    e.target.style.display = "none";
  });
}