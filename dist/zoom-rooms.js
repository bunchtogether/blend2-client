//      

import WebSocket from 'isomorphic-ws';
import EventEmitter from 'events';
import makeBlendLogger from './logger';
import { detectBlend, clearBlendDetection } from './capabilities';

/**
 * Class representing a Blend Zoom Client
 */
export default class ZoomRoomsClient extends EventEmitter {
  constructor() {
    super();
    this.webSocketLogger = makeBlendLogger('ZoomRooms WebSocket');
    this.ready = this.openWebSocket();
    this.ready.catch((error) => {
      this.webSocketLogger.error(error.message);
    });
    this.resetInProgress = false;
    this.reconnectAttempt = 0;
    this.reconnectAttemptResetTimeout = null;
  }

  async close() {
    try {
      await this.closeWebSocket();
    } catch (error) {
      this.webSocketLogger.error(`Error closing websocket: ${error.message}`); // eslint-disable-line no-console
    }
  }

  async reset() {
    if (this.resetInProgress) {
      return;
    }
    this.resetInProgress = true;
    await this.close();
    this.resetInProgress = false;
    this.reconnectAttempt += 1;
    this.openWebSocket();
  }

  /**
   * Connects to a server.
   * @param {string} address Stream URL
   * @return {Promise<void>}
   */
  async openWebSocket() {
    const address = 'ws://127.0.0.1:61340/api/1.0/zoom-rooms';

    const blendServerDetected = await detectBlend();

    if (!blendServerDetected) {
      this.webSocketLogger.error(`Unable to open web socket connection to ${address}, Blend Server not detected`);
      return;
    }

    const ws = new WebSocket(address);

    let heartbeatInterval;

    ws.binaryType = 'arraybuffer';

    ws.onclose = (event) => {
      clearInterval(heartbeatInterval);
      const { wasClean, reason, code } = event;
      if (!wasClean) {
        clearBlendDetection();
      }
      this.webSocketLogger.info(`${wasClean ? 'Cleanly' : 'Uncleanly'} closed websocket connection to ${address} with code ${code}${reason ? `: ${reason}` : ''}`);
      delete this.ws;
      this.emit('close', code, reason);
    };

    // ws.onmessage = (event) => {
    // const typedArray = new Uint8Array(event.data);
    // };

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
        this.webSocketLogger.error(`Unable to open socket to ${address}`);
        this.emit('error', event);
        reject(new Error('Unable to open'));
      };

      ws.onopen = () => {
        clearTimeout(timeout);
        this.emit('open');
        this.ws = ws;
        heartbeatInterval = setInterval(() => {
          if (ws.readyState === 1) {
            ws.send('');
          }
        }, 5000);
        ws.onerror = (event) => {
          this.webSocketLogger.error(event);
          this.emit('error', event);
        };
        resolve();
      };
    });
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
                           
                           
                                                 
                
                          
                       
}
