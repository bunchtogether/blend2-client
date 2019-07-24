// @flow

import superagent from 'superagent';

const BASE_API_URL = 'http://127.0.0.1:61340/api/1.0/zoom';

async function post(path: string, data: Object = {}) {
  try {
    return superagent
      .post(`${BASE_API_URL}${path}`)
      .send(data);
  } catch (error) {
    const { response: { text } } = error;
    throw new Error(text || error.message);
  }
}

async function join(meetingNumber: string, password: string) {
  await post('/join', { meetingNumber, password });
}

async function leave() {
  await post('/leave');
}

async function volume(volume: number) {
  await post('/audio/volume', { volume });
}

async function muteMic() {
  await post('/mic/mute');
}

async function unmuteMic() {
  await post('/mic/unmute');
}

async function enableVideo() {
  await post('/video/enable');
}

async function disableVideo() {
  await post('/video/disable');
}



const zoom = {
  join,
  leave,
  volume,
  muteMic,
  unmuteMic,
  enableVideo,
  disableVideo,
};

export default zoom;
