//      

import superagent from 'superagent';
import { detectBlend } from './server-detection';

let isDeviceAvailable = false;

function setCapabilities(responseBody         = {}) {
  isDeviceAvailable = !!responseBody.isDeviceAvailable;
}

async function getCapabilities()                {
  try {
    const { body } = await superagent.get('http://127.0.0.1:61340/api/1.0/capabilities');
    setCapabilities(body);
  } catch (error) {
    if (error.response) {
      setCapabilities();
    }
  }
}

export function getIsServerAvailable()                   {
  return detectBlend();
}

export async function getIsDeviceAvailable()                   {
  await getCapabilities();
  return isDeviceAvailable;
}
