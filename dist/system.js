//      

import superagent from 'superagent';
import { getIsVolumeControlAvailable } from './capabilities';

const BASE_API_URL = 'http://127.0.0.1:61340/api/1.0/system';

async function checkSystem() {
  const isVolumeControlAvailable = await getIsVolumeControlAvailable();
  if (!isVolumeControlAvailable) {
    throw new Error('Blend system control is not available');
  }
}

async function setVolume(volume        ) {
  await checkSystem();
  try {
    await superagent.post(`${BASE_API_URL}/volume`).send({ volume });
  } catch (error) {
    console.error(error);
    throw new Error(`Unable to set volume`);
  }
}

async function setMuted(muted         ) {
  await checkSystem();
  try {
    await superagent.post(`${BASE_API_URL}/muted`).send({ muted });
  } catch (error) {
    console.error(error);
    throw new Error(`Unable to set muted`);
  }
}



const system = {
  setVolume,
  setMuted
};

export default system;
