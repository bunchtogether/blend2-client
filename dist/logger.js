//      

/* eslint-disable no-console */

import superagent from 'superagent';
import { stringify } from 'flatted';
import { detectBlend, clearBlendDetection } from './capabilities';

export const log = (name       , level       , value    , description         ) => {
  let color = 'gray';
  switch (level) {
    case 'debug':
      color = 'blue';
      break;
    case 'info':
      color = 'green';
      break;
    case 'warn':
      color = 'orange';
      break;
    case 'error':
      color = 'red';
      break;
    default:
      throw new Error(`Unknown level ${level}`);
  }
  if (typeof value === 'string') {
    console.log(`%c${name}: %c${value}`, `color:${color}; font-weight: bold`, `color:${color}`);
    detectBlend().then((detected) => {
      if (!detected) {
        return;
      }
      superagent.post('http://127.0.0.1:61340/api/1.0/log').set('Content-Type', 'application/json').send({ name, level, value, description }).end((error) => {
        if (error) {
          console.error('Unable to post to logging API');
          console.error(error);
          clearBlendDetection();
        }
      });
    });
  } else {
    const sanitizedValue = JSON.parse(stringify(value));
    JSON.stringify(sanitizedValue, null, 2).split('\n').forEach((line) => {
      console.log(`%c${name}: %c${line}`, `color:${color}; font-weight: bold`, `color:${color}`);
    });
    detectBlend().then((detected) => {
      if (!detected) {
        return;
      }
      superagent.post('http://127.0.0.1:61340/api/1.0/log').set('Content-Type', 'application/json').send({ name, level, value: sanitizedValue, description }).end((error) => {
        if (error) {
          console.error('Unable to post to logging API');
          console.error(error);
          clearBlendDetection();
        }
      });
    });
  }
  if (typeof description === 'string') {
    console.log(`%c\t${description}`, 'color:gray');
  }
};

export default (name        ) => ({
  debug: (value    , description         ) => {
    log(name, 'debug', value, description);
  },
  info: (value    , description         ) => {
    log(name, 'info', value, description);
  },
  warn: (value    , description         ) => {
    log(name, 'warn', value, description);
  },
  error: (value    , description         ) => {
    log(name, 'error', value, description);
  },
});
