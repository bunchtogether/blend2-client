// @flow

import superagent from 'superagent';
import { eventChannel } from 'redux-saga';

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
    await superagent.get('http://127.0.0.1:61340/api/1.0/stream');
    console.log('%cBlend Service: %cDetected at http://127.0.0.1:61340', 'color:green; font-weight: bold', 'color:green');
    if (window && window.localStorage && !blendPreviouslyDetectedOnDevice) {
      blendPreviouslyDetectedOnDevice = true;
      window.localStorage.setItem('BLEND_DETECTED', 'true');
    }
    blendDetected = true;
    for (const blendDetectedCallback of blendDetectedCallbacks) {
      blendDetectedCallback(true);
    }
    retryAttempts = 0;
    return true;
  } catch (error) {
    retryAttempts += 1;
    if (blendPreviouslyDetectedOnDevice) {
      const duration = retryAttempts < 8 ? retryAttempts * retryAttempts * 1000 : 60000;
      retryAttemptTimeout = setTimeout(() => {
        console.log(`%cBlend Service: %cNot detected at http://127.0.0.1:61340, retrying in ${duration / 1000} seconds`, 'color:red; font-weight: bold', 'color:red');
        console.log();
        retryAttemptTimeout = null;
        detectBlend();
      }, duration);
    } else {
      retryAttemptTimeout = setTimeout(() => {
        console.log('%cBlend Service: %cNot detected at http://127.0.0.1:61340, retrying in 1 hour', 'color:green; font-weight: bold', 'color:green');
        retryAttemptTimeout = null;
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

export const getDetectBlendChannel = () => eventChannel((emit: Function) => {
  blendDetectedCallbacks.push((detected:boolean) => emit(detected));
  detectBlend();
  return () => {};
});