// @flow

import superagent from 'superagent';

let isServerAvailable = false;
let isDeviceAvailable = false;

function setCapabilities(responseBody: Object) {
  isServerAvailable = !!responseBody.isServerAvailable;
  isDeviceAvailable = !!responseBody.isDeviceAvailable;
}

async function getCapabilities(): Promise<void> {
  try {
    const { body } = await superagent.get('http://127.0.0.1:61340/api/1.0/capabilities');
    setCapabilities(body);
  } catch (error) {
    const { response: { body } } = error;
    if (body) {
      setCapabilities(body);
    }
  }
}

export async function getIsServerAvailable(): Promise<boolean> {
  await getCapabilities();
  return isServerAvailable;
}

export async function getIsDeviceAvailable(): Promise<boolean> {
  await getCapabilities();
  return isDeviceAvailable;
}
