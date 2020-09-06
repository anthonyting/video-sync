const MESSAGE_TYPE = {
  SDP: 'SDP',
  CANDIDATE: 'CANDIDATE',
}

/** @type {WebSocket} */
var socket = null;

async function startCapture(displayMediaOptions) {
  /** @type {MediaStream} */
  let captureStream = null;

  try {
    stopCapture();
    captureStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
    const data = await setupWebSocket();
    socket = data.socket;
    captureStream.getTracks().forEach(track => {
      data.peerConnection.addTrack(track, captureStream);
    });
  } catch (err) {
    console.error("Error: ", err);
  }
  return {
    captureStream,
    socket
  };
}

function stopCapture() {
  const localVideo = document.getElementById("local-video");
  if (localVideo && localVideo.srcObject) {
    let tracks = localVideo.srcObject.getTracks();

    tracks.forEach(track => track.stop());
    localVideo.srcObject = null;
  }
  if (socket && socket.readyState !== 3) {
    socket.close();
    socket = null;
  }
}

function createListeners() {
  document.getElementById('start').addEventListener('click', (event) => {
    event.preventDefault();
    startCapture({
        video: true,
        audio: true
      })
      .then(data => {
        const localVideo = document.getElementById("local-video");
        if (localVideo) {
          localVideo.srcObject = data.captureStream;
        }
        const onTrackEnd = () => {
          localVideo.srcObject = null
        }
        data.captureStream.getTracks().forEach(track => {
          track.onended = onTrackEnd;
        });
      });
  });
  document.getElementById('stop').addEventListener('click', (event) => {
    event.preventDefault();
    stopCapture();
  })
}

/**
 * @returns {Promise<{socket: WebSocket, peerConnection: RTCPeerConnection}>}
 */
async function setupWebSocket() {
  const socket = new WebSocket('wss://' + window.location.host);

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

  const peerConnection = createPeerConnection(socket);

  socket.onmessage = async msg => {
    let data;
    try {
      data = JSON.parse(msg.data);
    } catch (err) {
      console.error(err);
    }

    const {
      message_type,
      content
    } = data;

    try {
      if (message_type === MESSAGE_TYPE.CANDIDATE && content) {
        await peerConnection.addIceCandidate(content);
      } else if (message_type === MESSAGE_TYPE.SDP) {
        if (content.type === 'offer') {
          await peerConnection.setRemoteDescription(content);
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          socket.send(JSON.stringify({
            message_type: MESSAGE_TYPE.SDP,
            content: answer,
          }));
        } else if (content.type === 'answer') {
          await peerConnection.setRemoteDescription(content);
        } else {
          console.warn('Unsupported SDP type.', content.type);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  return socketPromise.then(() => {
    return {
      peerConnection,
      socket
    };
  });
}

/**
 * 
 * @param {WebSocket} socket 
 */
function createPeerConnection(socket) {
  /** @type {RTCConfiguration} */
  const ICE_CONFIG = {
    iceServers: [{
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302"
      ]
    }]
  };
  const connection = new RTCPeerConnection(ICE_CONFIG);

  connection.onnegotiationneeded = async () => {
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);

    socket.send(JSON.stringify({
      message_type: MESSAGE_TYPE.SDP,
      content: offer
    }));
  }

  connection.onicecandidate = event => {
    if (event && event.candidate) {
      socket.send(JSON.stringify({
        message_type: MESSAGE_TYPE.CANDIDATE,
        content: event.candidate
      }));
    }
  }

  connection.ontrack = event => {
    const video = document.getElementById('local-video');
    if (!video.srcObject) {
      video.srcObject = event.streams[0];
    }
  }

  return connection;
}
window.onload = createListeners;