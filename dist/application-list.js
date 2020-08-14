//      

import superagent from 'superagent';
import { detectBlend } from './capabilities';

const applicationList = {};

export default async () => {
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
};
