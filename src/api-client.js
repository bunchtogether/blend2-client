// @flow

import superagent from 'superagent';

const BASE_API_URL = 'http://127.0.0.1:61340/api/1.0';

async function updateHardwareManagerIp(ip: string) {
  try {
    return superagent
      .put(`${BASE_API_URL}/setup/ip`)
      .send({ ip });
  } catch (error) {
    const { response: { text } } = error;
    throw new Error(text || error.message || `Unable to update hardware manager ip to ${ip}`);
  }
}

const apiClient = {
  updateHardwareManagerIp,
};

export default apiClient;
