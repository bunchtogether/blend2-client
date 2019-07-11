// @flow

import superagent from 'superagent';
import { getIsDeviceAvailable } from './capabilities';

const BASE_API_URL = 'http://127.0.0.1:61340/api/1.0/device';

async function checkDevice() {
  const isDeviceAvailable = await getIsDeviceAvailable();
  if (!isDeviceAvailable) {
    throw new Error('Blend device is not available');
  }
}

async function setValue(value: string, data: Object = {}) {
  await checkDevice();
  try {
    return superagent
      .post(`${BASE_API_URL}/${value}`)
      .send(data);
  } catch (error) {
    const { response: { text } } = error;
    throw new Error(text || error.message || `Unable to set ${value}`);
  }
}

async function setPower(powerVal: boolean) {
  const { body: { power } } = await setValue('power', { power: powerVal });
  return power;
}

async function setVolume(volumeVal: number) {
  const { body: { volume } } = await setValue('volume', { volume: volumeVal });
  return volume;
}

async function toggleMute() {
  await setValue('mute');
}

async function setSource(sourceVal: string) {
  const { body: { source } } = await setValue('source', { source: sourceVal });
  return source;
}

const device = {
  setPower,
  setVolume,
  toggleMute,
  setSource,
};

export default device;
