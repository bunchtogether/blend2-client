// @flow

import superagent from 'superagent';

export default (async () => {
  try {
    await superagent.get('http://127.0.0.1:61340/api/1.0/stream');
    return true;
  } catch (error) {
    return false;
  }
})();
