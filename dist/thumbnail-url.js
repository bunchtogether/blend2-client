//      

import { detectBlend } from './server-detection';

export default async (streamUrl       ) => {
  const blendServerDetected = await detectBlend();
  if (!blendServerDetected) {
    throw new Error('Unable to generate thumbnail, Blend Server not detected');
  }
  return `http://127.0.0.1:61340/api/1.0/stream/${encodeURIComponent(streamUrl)}/thumbnail.jpg`;
};
