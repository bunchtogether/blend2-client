// @flow

import superagent from 'superagent';

const BASE_API_URL = 'http://127.0.0.1:61340/api/1.0/bluescape';

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

async function focus() {
  await post('/focus');
}

const zoom = {
  focus,
};

export default zoom;
