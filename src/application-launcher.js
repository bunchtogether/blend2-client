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

export async function getApplication(application:string) {
  const blendServerDetected = await detectBlend();
  if (blendServerDetected) {
    try {
      const { body } = await superagent.get(`http://127.0.0.1:61340/api/1.0/application/${application}`);
      return body;
    } catch (error) {
      throw new Error('Error in getting application');
    }
  }
  return applicationList;
}

const applicationLauncher = {
  getApplicationList,
  getApplication,
};

export default applicationLauncher;
