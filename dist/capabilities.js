//      

import superagent from 'superagent';
import { eventChannel, buffers } from 'redux-saga';

let isDeviceAvailable = false;
let isBluescapeAvailable = false;
let isZoomRoomAvailable = false;
let isVolumeControlAvailable = false;
let macAddress = '';

function setCapabilities(responseBody         = {}) {
  isDeviceAvailable = !!responseBody.isDeviceAvailable;
  isBluescapeAvailable = !!responseBody.isBluescapeAvailable;
  isZoomRoomAvailable = !!responseBody.isZoomRoomAvailable;
  isVolumeControlAvailable = responseBody.system && responseBody.system >= 1;
  macAddress = typeof responseBody.macAddress === 'string' ? responseBody.macAddress.replace(/-/g, ':').toUpperCase() : '';
}

export function getIsServerAvailable()                   {
  return detectBlend();
}

export async function getIsDeviceAvailable()                   {
  await detectBlend();
  return isDeviceAvailable;
}

export async function getIsVolumeControlAvailable()                   {
  await detectBlend();
  return isVolumeControlAvailable;
}

export async function getIsBluescapeAvailable()                   {
  await detectBlend();
  return isBluescapeAvailable;
}

export async function getIsZoomRoomAvailable()                   {
  const blendDetected = await detectBlend();
  if (blendDetected) {
    try {
      const { body } = await superagent.get('http://127.0.0.1:61340/api/1.0/capabilities');
      return body.isZoomRoomAvailable;
    } catch (error) {
      throw new Error('Error in checking zoom room availability');
    }
  }
  return isZoomRoomAvailable;
}

export async function getMacAddress()                  {
  await detectBlend();
  return macAddress;
}

export const blendDetectedCallbacks = [];

let blendDetected = false;

// Retry much more aggresively if we've ever seen Blend on this device before.
let blendPreviouslyDetectedOnDevice = false;
if (window && window.localStorage) {
  blendPreviouslyDetectedOnDevice = !!window.localStorage.getItem('BLEND_DETECTED');
}

let retryAttempts = 0;
let retryAttemptTimeout = null;

let detectBlendPromise = null;

export const detectBlend = () => {
  if (detectBlendPromise) {
    return detectBlendPromise;
  }
  detectBlendPromise = _detectBlend(); // eslint-disable-line no-underscore-dangle
  detectBlendPromise.then(() => {
    detectBlendPromise = null;
  }).catch(() => {
    detectBlendPromise = null;
  });
  return detectBlendPromise;
};

const _detectBlend = async () => { // eslint-disable-line no-underscore-dangle
  if (blendDetected) {
    return true;
  }
  if (retryAttemptTimeout) {
    return false;
  }
  try {
    const { body } = await superagent.get('http://127.0.0.1:61340/api/1.0/capabilities').timeout({ response: 5000, deadline: 15000 });
    console.log('%cBlend Service: %cDetected at http://127.0.0.1:61340', 'color:green; font-weight: bold', 'color:green');
    if (window && window.localStorage && !blendPreviouslyDetectedOnDevice) {
      blendPreviouslyDetectedOnDevice = true;
      window.localStorage.setItem('BLEND_DETECTED', 'true');
    }
    setCapabilities(body);
    blendDetected = true;
    for (const blendDetectedCallback of blendDetectedCallbacks) {
      blendDetectedCallback(true);
    }
    retryAttempts = 0;
    return true;
  } catch (error) {
    retryAttempts += 1;
    if (blendPreviouslyDetectedOnDevice) {
      const duration = retryAttempts < 6 ? retryAttempts * retryAttempts * 1000 : 30000;
      retryAttemptTimeout = setTimeout(() => {
        retryAttemptTimeout = null;
        console.log(`%cBlend Service: %cNot detected at http://127.0.0.1:61340, retrying in ${duration / 1000} seconds`, 'color:red; font-weight: bold', 'color:red');
        detectBlend();
      }, duration);
    } else {
      retryAttemptTimeout = setTimeout(() => {
        retryAttemptTimeout = null;
        console.log('%cBlend Service: %cNot detected at http://127.0.0.1:61340, retrying in 1 hour', 'color:green; font-weight: bold', 'color:green');
        detectBlend();
      }, 60 * 60 * 1000);
    }
    blendDetected = false;
    for (const blendDetectedCallback of blendDetectedCallbacks) {
      blendDetectedCallback(false);
    }
    return false;
  }
};

export const clearBlendDetection = () => {
  console.log('%cBlend Service: %cClearing Blend detection', 'color:orange; font-weight: bold', 'color:orange');
  blendDetected = false;
  detectBlend();
};

export const getDetectBlendChannel = () => eventChannel((emit          ) => {
  const handleDetected = (detected        ) => emit(detected);
  blendDetectedCallbacks.push(handleDetected);
  detectBlend();
  return () => {
    const index = blendDetectedCallbacks.indexOf(handleDetected);
    if (index !== -1) {
      blendDetectedCallbacks.splice(index, 1);
    }
  };
}, buffers.expanding(2));
