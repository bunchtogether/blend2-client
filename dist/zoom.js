//      

import superagent from 'superagent';

const BASE_API_URL = 'http://127.0.0.1:61340/api/1.0/zoom';

async function post(path        , data         = {}) {
  try {
    return superagent
      .post(`${BASE_API_URL}${path}`)
      .send(data);
  } catch (error) {
    const { response: { text } } = error;
    throw new Error(text || error.message);
  }
}

async function check(password        ) {
  await post('/check', { password });
}

async function join(meetingNumber        , password        ) {
  await post('/join', { meetingNumber, password });
}

async function leave() {
  await post('/leave');
}

async function share(password        ) {
  await post('/share', { password });
}

async function phoneCallOut(number        , password        ) {
  await post('/phone-call-out', { number, password });
}

async function listParticipants() {
  const results = await post('/listparticipants');
  return results;
}

async function volume(vlm        ) {
  await post('/audio/volume', { volume: vlm });
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
  listParticipants,
  check,
  phoneCallOut,
  share,
};

export default zoom;
