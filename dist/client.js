//      

import EventEmitter from 'events';
import WebSocket from 'isomorphic-ws';
import CaptionParser from 'mux.js/lib/mp4/caption-parser';
import mp4Probe from 'mux.js/lib/mp4/probe';
import ISOBoxer from 'codem-isoboxer';
import murmurHash from 'murmurhash-v3';
import { throttle, mean } from 'lodash';
import { detectBlend, clearBlendDetection } from './capabilities';
import makeBlendLogger from './logger';

const SYNC_INTERVAL_DURATION = 3000;
const MP4A = Buffer.from([0x6d, 0x70, 0x34, 0x61]); // mp4a
const AVCC = Buffer.from([0x61, 0x76, 0x63, 0x43]); // avcC

ISOBoxer.addBoxProcessor('prft', function () {
  this._procFullBox(); // eslint-disable-line no-underscore-dangle
  this._procField('reference_track_ID', 'uint', 32); // eslint-disable-line no-underscore-dangle
  this._procField('ntpTimestampInt', 'uint', 32); // eslint-disable-line no-underscore-dangle
  this._procField('ntpTimestampFrac', 'uint', 32); // eslint-disable-line no-underscore-dangle
  this._procField('mediaTime', 'uint', this.version === 1 ? 64 : 32); // eslint-disable-line no-underscore-dangle
});

const serializeBlendBox = (date     , timestamp       , maxTimestamp       , hash       ) => {
  const blendBox = Buffer.alloc(40);
  blendBox.set([0x00, 0x00, 0x00, 0x28, 0x73, 0x6B, 0x69, 0x70], 0);
  blendBox.writeDoubleBE(date.getTime(), 8);
  blendBox.writeDoubleBE(timestamp, 16);
  blendBox.writeDoubleBE(maxTimestamp, 24);
  blendBox.writeDoubleBE(hash, 32);
  return blendBox;
};

const deserializeBlendBox = (buffer       ) => {
  if (buffer[0] !== 0x00 || buffer[1] !== 0x00 || buffer[2] !== 0x00 || buffer[3] !== 0x28 || buffer[4] !== 0x73 || buffer[5] !== 0x6B || buffer[6] !== 0x69 || buffer[7] !== 0x70) {
    throw new Error('Invalid header');
  }
  const date = new Date(buffer.readDoubleBE(8));
  const timestamp = buffer.readDoubleBE(16);
  const maxTimestamp = buffer.readDoubleBE(24);
  const hash = buffer.readDoubleBE(32);
  return [date, timestamp, maxTimestamp, hash];
};

const Cue = window.VTTCue || window.TextTrackCue;

const isFirefox = navigator.userAgent.match(/Firefox\//);

const mergeUint8Arrays = (arrays) => {
  let length = 0;
  arrays.forEach((item) => {
    length += item.length;
  });
  const merged = new Uint8Array(length);
  let offset = 0;
  arrays.forEach((item) => {
    merged.set(item, offset);
    offset += item.length;
  });
  return merged;
};

function intersection(x1       , x2       , y1       , y2       ) {
  return Math.min(x2, y2) - Math.max(x1, y1);
}

function getDecodeTime(parsed        , timescale        ) { // eslint-disable-line no-unused-vars
  const tfdt = parsed.fetch('tfdt');
  if (tfdt) {
    const { baseMediaDecodeTime } = tfdt;
    return baseMediaDecodeTime / timescale;
  }
  return null;
}

function getTimestamp(parsed        ) { // eslint-disable-line no-unused-vars
  const prft = parsed.fetch('prft');
  if (prft) {
    const { ntpTimestampInt, ntpTimestampFrac } = prft;
    const date = new Date('Jan 01 1900 GMT');
    date.setUTCMilliseconds(date.getUTCMilliseconds() + ntpTimestampInt * 1000 + (ntpTimestampFrac * 1000) / 0x100000000);
    return date.getTime();
  }
  return null;
}

function getPresentationTime(parsed        , timescale        ) {
  const prft = parsed.fetch('prft');
  if (prft) {
    const { mediaTime } = prft;
    return mediaTime / timescale;
  }
  return null;
}


/**
 * Class representing a Blend Client
 */
export default class BlendClient extends EventEmitter {
  constructor(element                  , streamUrl       ) {
    super();
    this.syncHash = murmurHash(streamUrl);
    this.element = element;
    this.textTracks = new Map();
    this.cueRanges = [];
    this.streamUrl = streamUrl;
    this.videoQueue = [];
    this.resetInProgress = false;
    this.reconnectAttempt = 0;
    this.videoLogger = makeBlendLogger(`${streamUrl} Video Element`);
    this.mediaSourceLogger = makeBlendLogger(`${streamUrl} Media Source`);
    this.videoBufferLogger = makeBlendLogger(`${streamUrl} Video Source Buffer`);
    this.webSocketLogger = makeBlendLogger(`${streamUrl} WebSocket`);
    this.captionsLogger = makeBlendLogger(`${streamUrl} Captions`);
    this.setupElementLogging(element);
    this.ready = this.open();
    this.ready.catch((error) => {
      this.webSocketLogger.error(error.message);
    });
  }

  elementIsPlaying() {
    const element = this.element;
    if (!element) {
      return false;
    }
    return !!(element.currentTime > 0 && !element.paused && !element.ended && element.readyState > 2);
  }

  async close() {
    if (this.clearInitialization) {
      this.clearInitialization();
      delete this.clearInitialization;
    }
    clearTimeout(this.resetRetryTimeout);
    delete this.videoBuffer;
    this.element.removeAttribute('src');
    this.element.load();
    try {
      await this.closeWebSocket();
    } catch (error) {
      this.webSocketLogger.error(`Error closing websocket: ${error.message}`); // eslint-disable-line no-console
    }
    this.videoQueue = [];
  }

  async reset() {
    if (this.resetInProgress) {
      return;
    }
    this.resetInProgress = true;
    await this.close();
    for (const textTrack of this.textTracks.values()) {
      this.videoLogger.info(`Removing ${textTrack.cues.length} cues from text track`);
      for (const cue of textTrack.cues) {
        textTrack.removeCue(cue);
      }
    }
    this.resetInProgress = false;
    this.reconnectAttempt += 1;
    try {
      await this.open();
    } catch (error) {
      const duration = this.reconnectAttempt > 5 ? 30000 : this.reconnectAttempt * this.reconnectAttempt * 1000;
      this.webSocketLogger.error(`Error reopening websocket, retrying in ${duration / 1000} seconds: ${error.message}`); // eslint-disable-line no-console
      this.resetRetryTimeout = setTimeout(() => {
        this.resetInProgress = false;
        this.reset();
      }, duration);
    }
  }

  /**
   * Connects to a server.
   * @param {string} address Stream URL
   * @return {Promise<void>}
   */
  async open() {
    const streamUrl = this.streamUrl;
    const clientLogger = makeBlendLogger(`${streamUrl} Client`);
    const webSocketLogger = this.webSocketLogger;
    const element = this.element;
    const address = `ws://127.0.0.1:61340/api/1.0/stream/${encodeURIComponent(streamUrl)}/`;
    const blendServerDetected = await detectBlend();
    let localOffset = 0;
    if (!streamUrl) {
      throw new Error('Stream URL does not exist');
    }
    if (!element) {
      throw new Error('Element does not exist');
    }
    if (!webSocketLogger) {
      throw new Error('Websocket logger does not exist');
    }
    if (!blendServerDetected) {
      throw new Error(`Unable to open web socket connection to ${address}, Blend Server not detected`);
    }
    let stopSendingSyncInformation = Date.now() + 1000 * 60;
    let skipToNextBufferedSegmentInterval;
    let recoveryTimeout = null;
    let reconnectAttemptResetTimeout;
    const ws = new WebSocket(address);
    ws.binaryType = 'arraybuffer';
    const sendSyncInformation = () => {
      if (!this.elementIsPlaying()) {
        webSocketLogger.warn('Not sending sync information; element is not playing');
        return;
      }
      if (!localOffset) {
        webSocketLogger.warn('Not sending sync information; no local offset');
        return;
      }
      if (stopSendingSyncInformation < Date.now()) {
        return;
      }
      const bufferEnd = element.buffered && element.buffered.length > 0 ? element.buffered.end(element.buffered.length - 1) : 0;
      const currentTime = element.currentTime > 0 ? element.currentTime : 0;
      if (!currentTime) {
        webSocketLogger.warn('Not sending sync information; no current time');
        return;
      }
      if (!bufferEnd) {
        webSocketLogger.warn('Not sending sync information; no buffer end');
        return;
      }
      if (!ws || ws.readyState !== 1) {
        webSocketLogger.warn('Not sending sync information; no websocket');
        return;
      }
      const now = new Date();
      const adjustedPresentationTime = localOffset + currentTime;
      const adjustedBufferEnd = localOffset + bufferEnd;
      ws.send(serializeBlendBox(now, adjustedPresentationTime, adjustedBufferEnd, this.syncHash));
      remoteSyncData.push([now, adjustedPresentationTime, adjustedBufferEnd]);
      syncWithRemote();
    };

    const skipToNextBufferedSegment = () => {
      const videoBuffer = this.videoBuffer;
      if (!videoBuffer) {
        return;
      }
      for (let i = 0; i < videoBuffer.buffered.length; i += 1) {
        const segmentStart = videoBuffer.buffered.start(i);
        if (segmentStart > element.currentTime) {
          this.videoLogger.warn(`Skipping ${segmentStart - element.currentTime} ms`);
          element.currentTime = segmentStart; // eslint-disable-line no-param-reassign
          return;
        }
      }
    };

    const handleElementWaiting = () => {
      clearInterval(skipToNextBufferedSegmentInterval);
      ensureRecovery();
      if (!this.videoBuffer) {
        return;
      }
      skipToNextBufferedSegmentInterval = setInterval(() => {
        skipToNextBufferedSegment();
      }, 100);
      skipToNextBufferedSegment();
    };

    let recoveryStart = Date.now();

    const handleElementPlaying = () => {
      stopSendingSyncInformation = Date.now() + 1000 * 60;
      sendSyncInformation();
      clearInterval(skipToNextBufferedSegmentInterval);
      if (recoveryTimeout) {
        clientLogger.info(`Recovered after ${Math.round((Date.now() - recoveryStart) / 100) / 10} seconds`);
        if (recoveryTimeout) {
          clearTimeout(recoveryTimeout);
        }
        recoveryTimeout = null;
        reconnectAttemptResetTimeout = setTimeout(() => {
          this.reconnectAttempt = 0;
        }, 15000);
      }
    };

    const handleElementError = (event      ) => {
      if (event.type !== 'error') {
        return;
      }
      const mediaError = element.error;
      if (mediaError && mediaError.code === mediaError.MEDIA_ERR_DECODE) {
        this.reset();
      }
    };

    const handleElementCanPlay = () => {
      element.play();
    };

    const ensureRecovery = (skipLogError          = false) => {
      if (reconnectAttemptResetTimeout) {
        clearTimeout(reconnectAttemptResetTimeout);
      }
      if (this.elementIsPlaying()) {
        clientLogger.info('Element is playing, skipping recovery detection');
        return;
      }
      if (recoveryTimeout || this.resetInProgress) {
        clientLogger.info('Recovery detection already in progress, skipping');
        return;
      }
      if (!skipLogError) {
        clientLogger.info('Ensuring recovery after error detected');
      }
      recoveryStart = Date.now();
      clientLogger.info(`Reconnect attempt: ${this.reconnectAttempt}`);
      if (this.reconnectAttempt > 3) {
        clientLogger.info(`Attempting to play fallback stream after ${this.reconnectAttempt} attempts`);
        // Emit message to handle fallback url
        this.emit('handleFallbackStream');
        this.reconnectAttempt = 0;
      }
      recoveryTimeout = setTimeout(() => {
        if (this.elementIsPlaying()) {
          clientLogger.info('Detected playing element after recovery timeout');
          handleElementPlaying();
          return;
        }
        recoveryTimeout = null;
        clientLogger.error('Timeout after attempted recovery');
        this.reset();
      }, 10000);
    };

    ensureRecovery(true);

    element.addEventListener('waiting', handleElementWaiting);
    element.addEventListener('playing', handleElementPlaying);
    element.addEventListener('error', handleElementError);
    element.addEventListener('canplay', handleElementCanPlay);

    let heartbeatInterval;
    const captionParser = new CaptionParser();
    captionParser.init();

    ws.onclose = (event) => {
      clearInterval(heartbeatInterval);
      const { wasClean, reason, code } = event;
      if (!wasClean) {
        clearBlendDetection();
      }
      webSocketLogger.info(`${wasClean ? 'Cleanly' : 'Uncleanly'} closed websocket connection to ${address} with code ${code}${reason ? `: ${reason}` : ''}`);
      delete this.ws;
      this.emit('close', code, reason);
    };

    let trackIds;
    let timescales;
    let buffered = new Uint8Array([]);
    let lastPresentationTime;
    let segmentLength;
    let remoteSyncData = [];

    let resetPlaybackRateTimeout;
    const syncWithRemote = throttle(() => {
      if (!this.elementIsPlaying()) {
        webSocketLogger.warn('Not syncing with remote device; element not playing');
        return;
      }
      if (!localOffset) {
        webSocketLogger.warn('Not syncing with remote device; no local offset');
        return;
      }
      const currentTime = element.currentTime > 0 ? element.currentTime : 0;
      if (!currentTime) {
        webSocketLogger.warn('Not syncing with remote device; no current time');
        return;
      }
      if (!segmentLength) {
        webSocketLogger.warn('Not syncing with remote device; no segment length');
        return;
      }
      const now = new Date();
      remoteSyncData = remoteSyncData.filter((x) => now - x[0] < SYNC_INTERVAL_DURATION + 1100);
      if (remoteSyncData.length === 0) {
        webSocketLogger.warn('Not syncing with remote device; no remote sync data');
        return;
      }
      const currentTimestamp = currentTime + localOffset;
      const targetTimestamps = remoteSyncData.map((x) => {
        const time = x[1] + (now - x[0]) / 1000;
        return time;
      }).filter((x) => Math.abs(currentTimestamp - x) < segmentLength);
      if (targetTimestamps.length === 0) {
        webSocketLogger.warn('Not syncing with remote device; no target timestamp');
        return;
      }
      const maxTargetTimestamp = Math.max(...targetTimestamps);
      const targetTimestamp = (2 * mean(targetTimestamps) + maxTargetTimestamp) / 3;
      const remoteOffset = currentTimestamp - targetTimestamp;
      const absoluteRemoteOffset = Math.abs(remoteOffset);
      clearTimeout(resetPlaybackRateTimeout);
      if (absoluteRemoteOffset < 0.01) {
        element.playbackRate = 1;
        return;
      }
      this.videoLogger.info(`Adjusting for ${remoteOffset} second sync offset`);
      stopSendingSyncInformation = Date.now() + 1000 * 60;
      if (absoluteRemoteOffset < 0.05) {
        if (remoteOffset > 0) {
          element.playbackRate = 0.99;
        } else {
          element.playbackRate = 1.01;
        }
        resetPlaybackRateTimeout = setTimeout(() => {
          element.playbackRate = 1;
        }, 1000 * absoluteRemoteOffset / 0.01);
        return;
      }
      if (remoteOffset < 0) {
        const speed = 1 + absoluteRemoteOffset;
        if (speed > 5) {
          element.playbackRate = 5;
          resetPlaybackRateTimeout = setTimeout(() => {
            element.playbackRate = 1;
          }, 1000 * absoluteRemoteOffset / 5);
        } else {
          element.playbackRate = speed;
          resetPlaybackRateTimeout = setTimeout(() => {
            element.playbackRate = 1;
          }, 1000);
        }
      } else {
        const speed = 0.9;
        element.playbackRate = speed;
        resetPlaybackRateTimeout = setTimeout(() => {
          element.playbackRate = 1;
        }, 1000 * absoluteRemoteOffset / 0.9);
      }
    }, 1000);

    let initializedMediaSource = false;
    let foundFreebox = false;

    ws.onmessage = (event) => {
      const typedArray = new Uint8Array(event.data);
      const merged = new Uint8Array(buffered.byteLength + typedArray.byteLength);
      merged.set(buffered, 0);
      merged.set(typedArray, buffered.byteLength);
      buffered = merged;
      const parsed = ISOBoxer.parseBuffer(buffered.buffer);
      if (parsed._incomplete) { // eslint-disable-line no-underscore-dangle
        return;
      }
      if (!trackIds || !timescales) {
        const checkedTimescales = mp4Probe.timescale(buffered);
        if (Object.keys(checkedTimescales).length > 0) {
          timescales = checkedTimescales;
          const checkedTrackIds = mp4Probe.videoTrackIds(buffered);
          if (checkedTrackIds && checkedTrackIds.length > 0) {
            trackIds = checkedTrackIds;
          }
          if (!trackIds || trackIds.length === 0) {
            return;
          }
        }
      }
      if (!initializedMediaSource) {
        const moov = parsed.fetch('moov');
        if (!moov) {
          return;
        }
        this.setupMediaSource(Buffer.from(buffered));
        initializedMediaSource = true;
      }
      if (!foundFreebox) {
        const freeBoxes = parsed.fetchAll('free');
        webSocketLogger.info(`Found ${freeBoxes.length} free boxes`);
        for (const freeBox of freeBoxes) {
          const freeBoxData = Buffer.from(freeBox._raw.buffer); // eslint-disable-line no-underscore-dangle
          if (freeBoxData[8] === 0x3E && freeBoxData[9] === 0x3E) {
            localOffset = freeBoxData.readDoubleBE(10);
            webSocketLogger.info(`Got local offset of ${localOffset} from free box`);
            foundFreebox = true;
          } else {
            webSocketLogger.error(`Could not parse free box: ${JSON.stringify(Array.from(freeBoxData))}`);
          }
        }
      }
      if (timescales && timescales['1']) {
        const presentationTime = getPresentationTime(parsed, timescales['1']);
        if (presentationTime) {
          if (lastPresentationTime) {
            segmentLength = (presentationTime - lastPresentationTime);
          }
          lastPresentationTime = presentationTime;
        }
      }
      const skipBox = parsed.fetch('skip');
      if (skipBox) {
        try {
          const [date, timestamp, maxTimestamp, hash] = deserializeBlendBox(Buffer.from(skipBox._raw.buffer)); // eslint-disable-line no-underscore-dangle
          if (this.syncHash === hash) {
            stopSendingSyncInformation = Date.now() + 1000 * 60;
            remoteSyncData.push([date, timestamp, maxTimestamp]);
            syncWithRemote();
          }
        } catch (error) {
          webSocketLogger.error(`Unable to parse Blend box: ${error.message}`);
          console.error(error);
        }
      }
      try {
        captionParser.clearParsedCaptions();
        const parsedCaptions = captionParser.parse(buffered, trackIds, timescales);
        if (parsedCaptions) {
          const { captions } = parsedCaptions;
          for (const caption of captions) {
            this.addCaption(caption);
          }
        }
      } catch (error) {
        this.captionsLogger.error(error.message);
      }
      const videoBuffer = this.videoBuffer;
      const videoQueue = this.videoQueue;
      if (videoBuffer) {
        if (videoQueue.length > 0 || videoBuffer.updating) {
          videoQueue.push(buffered);
        } else {
          try {
            videoBuffer.appendBuffer(buffered);
          } catch (error) {
            this.videoBufferLogger.error(`${error.message}, code: ${error.code}`);
          }
        }
      } else {
        videoQueue.push(buffered);
      }
      buffered = new Uint8Array([]);
    };

    const now = Date.now();
    let syncInterval;
    const startSyncIntervalTimeout = setTimeout(() => {
      webSocketLogger.info('Starting sync interval');
      syncInterval = setInterval(sendSyncInformation, SYNC_INTERVAL_DURATION);
    }, SYNC_INTERVAL_DURATION - now % SYNC_INTERVAL_DURATION);

    this.clearInitialization = () => {
      clearInterval(heartbeatInterval);
      clearTimeout(startSyncIntervalTimeout);
      clearInterval(syncInterval);
      clearTimeout(resetPlaybackRateTimeout);
      clearTimeout(reconnectAttemptResetTimeout);
      if (recoveryTimeout) {
        clearTimeout(recoveryTimeout);
      }
      element.removeEventListener('waiting', handleElementWaiting);
      element.removeEventListener('playing', handleElementPlaying);
      element.removeEventListener('error', handleElementError);
      element.removeEventListener('canplay', handleElementCanPlay);
    };

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const error = new Error('Unable to open websocket, timeout after 10 seconds');
        this.emit('error', error);
        ws.onerror = () => {};
        ws.onopen = () => {};
        reject(error);
      }, 10000);

      ws.onerror = (event) => {
        clearTimeout(timeout);
        webSocketLogger.error(`Unable to open socket to ${streamUrl}`);
        this.emit('error', event);
        reject(new Error('Unable to open'));
      };

      ws.onopen = () => {
        clearTimeout(timeout);
        this.emit('open');
        this.ws = ws;
        heartbeatInterval = setInterval(() => {
          if (ws.readyState === 1) {
            ws.send(new Uint8Array([]));
          }
        }, 5000);
        ws.onerror = (event) => {
          webSocketLogger.error(event);
          this.emit('error', event);
        };
        resolve();
      };
    });
  }

  addCaption({ stream, startTime, endTime, text }                                                                  ) {
    let textTrack = this.textTracks.get(stream);
    if (!textTrack) {
      textTrack = this.element.addTextTrack('captions', 'English', 'en');
      this.textTracks.set(stream, textTrack);
    }
    const ranges = this.cueRanges;
    let merged = false;
    for (let i = ranges.length; i--;) {
      const cueRange = ranges[i];
      const overlap = intersection(cueRange[0], cueRange[1], startTime, endTime);
      if (overlap >= 0) {
        cueRange[0] = Math.min(cueRange[0], startTime);
        cueRange[1] = Math.max(cueRange[1], endTime);
        merged = true;
        if ((overlap / (endTime - startTime)) > 0.5) {
          return;
        }
      }
    }
    if (!merged) {
      ranges.push([startTime, endTime]);
    }
    const element = this.element;
    if (!element) {
      this.captionsLogger.error('Unable to add caption to text track, element does not exist');
      return;
    }
    const currentTime = element.currentTime > 0 ? element.currentTime : 0;
    if (typeof currentTime !== 'number') {
      this.captionsLogger.warn('Unable to add caption to text track, no current time');
      return;
    }
    if (typeof startTime !== 'number') {
      this.captionsLogger.warn('Unable to add caption to text track, start time is out of range');
      return;
    }
    if (typeof endTime !== 'number' || endTime > currentTime + 30) {
      this.captionsLogger.warn('Unable to add caption to text track, end time is out of range');
      return;
    }
    const cue = new Cue(startTime, endTime, text);
    cue.line = 1;
    cue.align = 'left';
    cue.position = isFirefox ? 55 : 5;
    textTrack.addCue(cue);
  }

  /**
   * Close connection to server.
   * @param {number} [code] Websocket close reason code to send to the server
   * @param {string} [reason] Websocket close reason to send to the server
   * @return {Promise<void>}
   */
  async closeWebSocket(code         , reason         ) {
    const ws = this.ws;
    if (!ws) {
      return;
    }
    ws.onmessage = () => {};
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeListener('error', onError);
        this.removeListener('close', onClose);
        reject(new Error('Unable to close websocket, timeout after 5 seconds'));
      }, 5000);
      const onClose = () => {
        clearTimeout(timeout);
        this.removeListener('error', onError);
        resolve();
      };
      const onError = (event       ) => {
        clearTimeout(timeout);
        this.removeListener('close', onClose);
        reject(event);
      };
      this.once('error', onError);
      this.once('close', onClose);
      ws.close(code, reason);
    });
  }

  async setupMediaSource(buffer        ) {
    const element = this.element;
    if (!element) {
      this.videoLogger.error('Unable to setup media source, element does not exist');
      return;
    }
    let audioString = '';
    let mimeType = 'video/mp4; codecs="avc1.64001f, mp4a.40.2"';
    if (buffer.indexOf(MP4A) !== -1) {
      audioString = ', mp4a.40.2';
    }
    let index = buffer.indexOf(AVCC);
    if (index !== -1) {
      index += 5;
      mimeType = `video/mp4; codecs="avc1.${buffer.slice(index, index + 3).toString('hex').toUpperCase()}${audioString}"`;
      this.videoLogger.info(`Detected stream with mimetype ${mimeType}`);
    } else {
      this.videoLogger.info(`Unable to detect stream mimetype, using ${mimeType}`);
    }
    const mediaSource = new MediaSource();
    this.setupMediaSourceLogging(mediaSource);
    element.src = URL.createObjectURL(mediaSource); // eslint-disable-line no-param-reassign
    await new Promise((resolve) => {
      const handle = () => {
        mediaSource.removeEventListener('sourceopen', handle);
        resolve();
      };
      mediaSource.addEventListener('sourceopen', handle);
    });
    const videoBuffer = mediaSource.addSourceBuffer(mimeType);
    this.videoBuffer = videoBuffer;
    this.setupVideoBufferLogging(videoBuffer);
    videoBuffer.addEventListener('updateend', async () => {
      if (this.videoQueue.length > 0 && !videoBuffer.updating) {
        try {
          const data = mergeUint8Arrays(this.videoQueue);
          this.videoQueue = [];
          videoBuffer.appendBuffer(data);
        } catch (error) {
          this.videoBufferLogger.error(`${error.message}, code: ${error.code}`);
        }
      }
    });
    if (this.videoQueue.length > 0 && !videoBuffer.updating) {
      try {
        const data = mergeUint8Arrays(this.videoQueue);
        this.videoQueue = [];
        videoBuffer.appendBuffer(data);
      } catch (error) {
        this.videoBufferLogger.error(`${error.message}, code: ${error.code}`);
      }
    }
  }

  setupMediaSourceLogging(mediaSource             ) {
    const mediaSourceLogger = this.mediaSourceLogger;
    mediaSource.addEventListener('sourceopen', () => {
      mediaSourceLogger.info('sourceopen');
    });
    mediaSource.addEventListener('sourceended', () => {
      mediaSourceLogger.info('sourceended');
    });
    mediaSource.addEventListener('sourceclose', () => {
      mediaSourceLogger.info('sourceclose');
    });
    mediaSource.addEventListener('updatestart', () => {
      mediaSourceLogger.info('updatestart');
    });
    mediaSource.addEventListener('update', () => {
      mediaSourceLogger.info('update');
    });
    mediaSource.addEventListener('updateend', () => {
      mediaSourceLogger.info('updateend');
    });
    mediaSource.addEventListener('error', () => {
      mediaSourceLogger.info('error');
    });
    mediaSource.addEventListener('abort', () => {
      mediaSourceLogger.info('abort');
    });
    mediaSource.addEventListener('addsourcevideoBuffer', () => {
      mediaSourceLogger.info('addsourcevideoBuffer');
    });
    mediaSource.addEventListener('removesourcevideoBuffer', () => {
      mediaSourceLogger.info('removesourcevideoBuffer');
    });
  }

  setupVideoBufferLogging(videoBuffer              ) {
    const videoBufferLogger = this.videoBufferLogger;
    videoBuffer.addEventListener('sourceopen', () => {
      videoBufferLogger.info('sourceopen');
    });
    videoBuffer.addEventListener('sourceended', () => {
      videoBufferLogger.info('sourceended');
    });
    videoBuffer.addEventListener('sourceclose', () => {
      videoBufferLogger.info('sourceclose');
    });
    videoBuffer.addEventListener('error', () => {
      videoBufferLogger.info('error');
    });
    videoBuffer.addEventListener('abort', () => {
      videoBufferLogger.info('abort');
    });
    videoBuffer.addEventListener('addsourcevideoBuffer', () => {
      videoBufferLogger.info('addsourcevideoBuffer');
    });
    videoBuffer.addEventListener('removesourcevideoBuffer', () => {
      videoBufferLogger.info('removesourcevideoBuffer');
    });
  }

  setupElementLogging(element                  ) {
    const videoLogger = this.videoLogger;
    element.addEventListener('resize', () => {
      videoLogger.info('abort', 'Sent when playback is aborted; for example, if the media is playing and is restarted from the beginning, this event is sent');
    });
    element.addEventListener('canplay', () => {
      videoLogger.info('canplay', 'Sent when enough data is available that the media can be played, at least for a couple of frames.  This corresponds to the HAVE_ENOUGH_DATA readyState');
    });
    element.addEventListener('canplaythrough', () => {
      videoLogger.info('canplaythrough', 'Sent when the ready state changes to CAN_PLAY_THROUGH, indicating that the entire media can be played without interruption, assuming the download rate remains at least at the current level. It will also be fired when playback is toggled between paused and playing. Note: Manually setting the currentTime will eventually fire a canplaythrough event in firefox. Other browsers might not fire this event');
    });
    element.addEventListener('durationchange', () => {
      videoLogger.info('durationchange', 'The metadata has loaded or changed, indicating a change in duration of the media.  This is sent, for example, when the media has loaded enough that the duration is known');
    });
    element.addEventListener('emptied', () => {
      videoLogger.info('emptied', 'The media has become empty; for example, this event is sent if the media has already been loaded (or partially loaded), and the load() method is called to reload it');
    });
    element.addEventListener('encrypted', () => {
      videoLogger.info('encrypted', ' The user agent has encountered initialization data in the media data');
    });
    element.addEventListener('ended', () => {
      videoLogger.info('ended', 'Sent when playback completes');
    });
    element.addEventListener('error', (event              ) => {
      const mediaError = element.error;
      const message = mediaError && mediaError.message ? mediaError.message : null;
      if (mediaError && message) {
        videoLogger.error(`${mediaError.code}: ${message}`);
      } else {
        videoLogger.error('error', 'Sent when an error occurs.  The element\'s error attribute contains more information. See HTMLMediaElement.error for details');
        if (event) {
          videoLogger.error(event);
        }
      }
    });
    element.addEventListener('interruptbegin', () => {
      videoLogger.info('interruptbegin', 'Sent when audio playing on a Firefox OS device is interrupted, either because the app playing the audio is sent to the background, or audio in a higher priority audio channel begins to play. See Using the AudioChannels API for more details');
    });
    element.addEventListener('interruptend', () => {
      videoLogger.info('interruptend', 'Sent when previously interrupted audio on a Firefox OS device commences playing again — when the interruption ends. This is when the associated app comes back to the foreground, or when the higher priority audio finished playing. See Using the AudioChannels API for more details');
    });
    element.addEventListener('loadeddata', () => {
      videoLogger.info('loadeddata', 'The first frame of the media has finished loading');
    });
    element.addEventListener('loadedmetadata', () => {
      videoLogger.info('loadedmetadata', 'The media\'s metadata has finished loading; all attributes now contain as much useful information as they\'re going to');
    });
    element.addEventListener('loadstart', () => {
      videoLogger.info('loadstart', 'Sent when loading of the media begins');
    });
    element.addEventListener('mozaudioavailable', () => {
      videoLogger.info('mozaudioavailable', 'Sent when an audio videoBuffer is provided to the audio layer for processing; the videoBuffer contains raw audio samples that may or may not already have been played by the time you receive the event');
    });
    element.addEventListener('pause', () => {
      videoLogger.info('pause', 'Sent when the playback state is changed to paused (paused property is true)');
    });
    element.addEventListener('play', () => {
      videoLogger.info('play', 'Sent when the playback state is no longer paused, as a result of the play method, or the autoplay attribute');
    });
    element.addEventListener('playing', () => {
      videoLogger.info('playing', 'Sent when the media has enough data to start playing, after the play event, but also when recovering from being stalled, when looping media restarts, and after seeked, if it was playing before seeking');
    });
    element.addEventListener('ratechange', () => {
      videoLogger.info(`ratechange: ${element.playbackRate}`, 'Sent when the playback speed changes');
    });
    element.addEventListener('seeked', () => {
      videoLogger.info('seeked', 'Sent when a seek operation completes');
    });
    element.addEventListener('seeking', () => {
      videoLogger.info('seeking', 'Sent when a seek operation begins');
    });
    element.addEventListener('stalled', () => {
      videoLogger.info('stalled', 'Sent when the user agent is trying to fetch media data, but data is unexpectedly not forthcoming');
    });
    element.addEventListener('suspend', () => {
      videoLogger.info('suspend', 'Sent when loading of the media is suspended; this may happen either because the download has completed or because it has been paused for any other reason');
    });
    element.addEventListener('volumechange', () => {
      videoLogger.info('volumechange', 'Sent when the audio volume changes (both when the volume is set and when the muted attribute is changed)');
    });
    element.addEventListener('waiting', () => {
      videoLogger.info('waiting', 'Sent when the requested operation (such as playback) is delayed pending the completion of another operation (such as a seek)');
    });
  }

            
                   
                            
                           
                               
                           
                            
                   
                
                       
                      
                            
                            
                          
                         
                               
                       
                                     
                                     
                                  
}

