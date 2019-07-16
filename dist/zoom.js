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

async function join(meetingNumber        ) {
  await post('join', { meetingNumber });
}

async function leave() {
  await post('leave');
}

const zoom = {
  join,
  leave,
};

export default zoom;
