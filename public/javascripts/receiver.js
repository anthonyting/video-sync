const MESSAGE_TYPE = {
  SDP: 'SDP',
  CANDIDATE: 'CANDIDATE',
}

async function createListeners() {
  /**
   * @type {{socket: WebSocket, peerConnection: RTCPeerConnection}}
   */
  let data = null;
  document.getElementById('start').addEventListener('click', async (event) => {
    event.preventDefault();
    try {
      data = await setupWebSocket();
    } catch (err) {
      console.error("Error: ", err);
    }
  });
  document.getElementById('stop').addEventListener('click', async (event) => {
    event.preventDefault();
    if (data) {
      if (data.socket && data.socket.readyState !== 3) {
        data.socket.close();
      }
      if (data.peerConnection) {
        data.peerConnection.close();
      }
    }
  });
}

/**
 * @returns {Promise<{socket: WebSocket, peerConnection: RTCPeerConnection}>}
 */
async function setupWebSocket() {
  const socket = new WebSocket('wss://' + window.location.host + '/?isViewer=true');

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
          const answer = await peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
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
function createPeerConnection() {
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
    const offer = await connection.createOffer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: true
    });
    await connection.setLocalDescription(offer);
  }

  connection.ontrack = event => {
    const video = document.getElementById('remote-video');
    if (!video.srcObject) {
      video.srcObject = event.streams[0];
    }
    const onStreamEnd = () => {
      video.srcObject = null;
    }
    event.streams[0].getTracks().forEach(track => {
      track.onended = onStreamEnd;
    });
  }

  return connection;
}

window.onload = createListeners;