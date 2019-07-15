//      

import superagent from 'superagent';

let isServerAvailable = false;
let isDeviceAvailable = false;

function setCapabilities(responseBody         = {}) {
  isServerAvailable = !!responseBody.isServerAvailable;
  isDeviceAvailable = !!responseBody.isDeviceAvailable;
}

async function getCapabilities()                {
  try {
    const { body } = await superagent.get('http://127.0.0.1:61340/api/1.0/capabilities');
    setCapabilities(body);
  } catch (error) {
    if (error.response) {
      setCapabilities(error.response.body);
    }
  }
}

export async function getIsServerAvailable()                   {
  await getCapabilities();
  return isServerAvailable;
}

export async function getIsDeviceAvailable()                   {
  await getCapabilities();
  return isDeviceAvailable;
}
