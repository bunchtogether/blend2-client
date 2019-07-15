//      

import superagent from 'superagent';

const BASE_API_URL = 'http://127.0.0.1:61340/api/1.0/zoom';

async function post(path        , data         = {}) {
  try {
    return superagent
      .post(`${BASE_API_URL}/${path}`)
      .send(data);
  } catch (error) {
    const { response: { text } } = error;
    throw new Error(text || error.message);
  }
}

async function startMeeting(meetingNumber        ) {
  await post('start', { meetingNumber });
}

async function stopMeeting() {
  await post('stop');
}

const zoom = {
  startMeeting,
  stopMeeting,
};

export default zoom;
