// @flow

import superagent from 'superagent';
import { detectBlend } from './capabilities';

const applicationList = {};

export async function getApplicationList() {
  const blendServerDetected = await detectBlend();
  if (blendServerDetected) {
    try {
      const { body } = await superagent.get('http://127.0.0.1:61340/api/1.0/application/applicationList');
      return body;
    } catch (error) {
      throw new Error('Error in getting application list');
    }
  }
  return applicationList;
}

export async function getIconImages(iconRequest:string) {
  const blendServerDetected = await detectBlend();
  if (blendServerDetected) {
    try {
      const { body } = await superagent.post('http://127.0.0.1:61340/api/1.0/application/iconImageList').send(iconRequest);
      return body;
    } catch (error) {
      throw new Error('Error in getting application icon image list');
    }
  }
  return applicationList;
}

export async function launchApplication(appID: string) {
  const blendServerDetected = await detectBlend();
  if (blendServerDetected) {
    try {
      const { body } = await superagent.post('http://127.0.0.1:61340/api/1.0/application/launch').send({ appID });
      return body;
    } catch (error) {
      throw new Error('Error in launching application');
    }
  }
  return applicationList;
}

const applicationLauncher = {
  getApplicationList,
  getIconImages,
  launchApplication,
};

export default applicationLauncher;
