// @flow
/* eslint-disable camelcase */

import WebSocket from 'isomorphic-ws';
import superagent from 'superagent';
import EventEmitter from 'events';
import makeBlendLogger from './logger';
import { detectBlend, clearBlendDetection } from './capabilities';

/**
 * Class representing a Blend Zoom Room Client
 */
export default class ZoomRoomClient extends EventEmitter {
  constructor(passcode:string) {
    super();
    this.passcode = passcode;
    this.webSocketLogger = makeBlendLogger('ZoomRooms WebSocket');
    this.ready = this.openWebSocket();
    this.ready.catch((error) => {
      this.webSocketLogger.error(error.message);
    });
    this.resetInProgress = false;
    this.reconnectAttempt = 0;

    const zcommand:Object = {
      dial: {},
      call: {},
      bookings: {},
      phonebook: {},
      phonecall: {},
      test: {},
      schedule: {},
    };

    this.zcommand = zcommand;

    const zconfiguration:Object = {
      client: {},
      call: {},
      audio: {},
      video: {},
    };

    this.zconfiguration = zconfiguration;

    const zstatus:Object = {
      call: {},
      audio: {},
      video: {},
    };

    this.zstatus = zstatus;

    zcommand.dial.start = (parameters:{meetingNumber: string}) => this.call('zcommand.dial.start', parameters);

    zcommand.dial.startPMI = (parameters:{duration: number}) => this.call('zcommand.dial.startPMI', parameters);

    zcommand.dial.join = (parameters:{meetingNumber: string}) => this.call('zcommand.dial.join', parameters);

    zcommand.call.disconnect = () => this.call('zcommand.call.disconnect');

    zcommand.call.info = () => this.call('zcommand.call.info');

    zcommand.call.muteAll = (parameters:{mute: 'on' | 'off'}) => this.call('zcommand.call.muteAll', parameters);

    zcommand.call.muteParticipant = (parameters:{mute: 'on' | 'off', id: number}) => this.call('zcommand.call.muteParticipant', parameters);

    zcommand.call.listParticipants = () => this.call('zcommand.call.listParticipants');

    zcommand.call.accept = (parameters:{callerJID: string}) => this.call('zcommand.call.accept', parameters);

    zcommand.call.reject = (parameters:{callerJID: string}) => this.call('zcommand.call.reject', parameters);

    zcommand.invite = (parameters:{duration: number, users: Array<string>}) => this.call('zcommand.invite', parameters);

    zcommand.phonebook.list = (parameters?:{offset?: number, limit?: number}) => this.call('zcommand.phonebook.list', parameters);

    zcommand.run = (parameters:{file: string}) => this.call('zcommand.run', parameters);

    zcommand.comment = (parameters:{text: string}) => this.call('zcommand.comment', parameters);

    zcommand.wait = (parameters:{sec: number}) => this.call('zcommand.wait', parameters);

    zcommand.call.leave = () => this.call('zcommand.call.leave');

    zcommand.call.invite = (parameters:{user: string, users: Array<string>}) => this.call('zcommand.call.invite', parameters);

    zcommand.call.inviteH323Room = (parameters:{address: string, cancel: 'on' | 'off'}) => this.call('zcommand.call.inviteH323Room', parameters);

    zcommand.call.inviteSIPRoom = (parameters:{address: string, cancel: 'on' | 'off'}) => this.call('zcommand.call.inviteSIPRoom', parameters);

    zcommand.call.muteParticipantVideo = (parameters:{mute: boolean, id: number}) => this.call('zcommand.call.muteParticipantVideo', parameters);

    zcommand.bookings.update = () => this.call('zcommand.bookings.update');

    zcommand.dial.sharing = (parameters:{duration: number, displayState: 'None' | 'Laptop' | 'IOS', password: string}) => this.call('zcommand.dial.sharing', parameters);

    zcommand.call.shareCamera = (parameters:{id: string, status: 'on' | 'off'}) => this.call('zcommand.call.shareCamera', parameters);

    zcommand.call.setInstructions = (parameters:{show: 'on' | 'off', type: 'Laptop' | 'IOS' | 'None'}) => this.call('zcommand.call.setInstructions', parameters);

    zcommand.call.sharing = {};

    zcommand.call.sharing.toNormal = () => this.call('zcommand.call.sharing.toNormal');

    zcommand.call.sharing.disconnect = () => this.call('zcommand.call.sharing.disconnect');

    zcommand.call.sharing.hdmi = {};

    zcommand.call.sharing.hdmi.start = () => this.call('zcommand.call.sharing.hdmi.start');

    zcommand.call.sharing.hdmi.stop = () => this.call('zcommand.call.sharing.hdmi.stop');

    zcommand.call.layout = {};

    zcommand.call.layout.turnPage = (parameters:{forward: boolean}) => this.call('zcommand.call.layout.turnPage', parameters);

    zcommand.call.expel = (parameters:{id: number}) => this.call('zcommand.call.expel', parameters);

    zcommand.test.microphone = {};

    zcommand.test.microphone.start = (parameters:{id: string}) => this.call('zcommand.test.microphone.start', parameters);

    zcommand.test.microphone.stop = () => this.call('zcommand.test.microphone.stop');

    zcommand.test.speaker = {};

    zcommand.test.speaker.start = (parameters:{id: string}) => this.call('zcommand.test.speaker.start', parameters);

    zcommand.test.speaker.stop = () => this.call('zcommand.test.speaker.stop');

    zcommand.call.hostChange = (parameters:{id: number}) => this.call('zcommand.call.hostChange', parameters);

    zcommand.call.hostClaim = (parameters:{key: number}) => this.call('zcommand.call.hostClaim', parameters);

    zcommand.call.record = (parameters:{enable: 'on' | 'off'}) => this.call('zcommand.call.record', parameters);

    zcommand.call.spotlight = (parameters:{id: number, enable: 'on' | 'off'}) => this.call('zcommand.call.spotlight', parameters);

    zcommand.call.allowRecord = (parameters:{id: number, enable: 'on' | 'off'}) => this.call('zcommand.call.allowRecord', parameters);

    zcommand.call.cameraControl = (parameters:{id: number, speed?: number, state?: 'Start' | 'Continue' | 'Stop' | 'RequestRemote' | 'GiveupRemote' | 'RequestedByFarEnd', action?: 'Left' | 'Right' | 'Up' | 'Down' | 'In' | 'Out'}) => this.call('zcommand.call.cameraControl', parameters);

    zcommand.dial.checkin = (parameters:{meetingNumber: string}) => this.call('zcommand.dial.checkin', parameters);

    zcommand.schedule.add = (parameters:{meetingName: string, start: string, end: string, private: 'on' | 'off'}) => this.call('zcommand.schedule.add', parameters);

    zcommand.schedule.delete = (parameters:{meetingNumber: string}) => this.call('zcommand.schedule.delete', parameters);

    zcommand.dial.phoneCallOut = (parameters:{number: string}) => this.call('zcommand.dial.phoneCallOut', parameters);

    zcommand.dial.phoneHangUp = (parameters:{callID: string}) => this.call('zcommand.dial.phoneHangUp', parameters);

    zcommand.phonecall.list = () => this.call('zcommand.phonecall.list');

    zconfiguration.call.sharing = (parameters:{optimize_video_sharing: 'on' | 'off'}) => this.call('zconfiguration.call.sharing', parameters);

    zconfiguration.call.sharing.optimize_video_sharing = () => this.call('zconfiguration.call.sharing.optimize_video_sharing');

    zconfiguration.call.microphone = (parameters:{mute: 'on' | 'off'}) => this.call('zconfiguration.call.microphone', parameters);

    zconfiguration.call.microphone.mute = () => this.call('zconfiguration.call.microphone.mute');

    zconfiguration.call.camera = (parameters:{mute: 'on' | 'off'}) => this.call('zconfiguration.call.camera', parameters);

    zconfiguration.audio.input = {};

    zconfiguration.audio.input.selectedID = (selectedID?: string) => this.call('zconfiguration.audio.input.selectedID', { value: selectedID });

    zconfiguration.audio.input.is_sap_disabled = (is_sap_disabled?: 'on' | 'off') => this.call('zconfiguration.audio.input.is_sap_disabled', { value: is_sap_disabled });

    zconfiguration.audio.input.reduce_reverb = (reduce_reverb?: 'on' | 'off') => this.call('zconfiguration.audio.input.reduce_reverb', { value: reduce_reverb });

    zconfiguration.audio.input.volume = (volume?: number) => this.call('zconfiguration.audio.input.volume', { value: volume });

    zconfiguration.audio.output = {};

    zconfiguration.audio.output.selectedID = (selectedID?: string) => this.call('zconfiguration.audio.output.selectedID', { value: selectedID });

    zconfiguration.audio.output.volume = (volume?: number) => this.call('zconfiguration.audio.output.volume', { value: volume });

    zconfiguration.video = (parameters:{hide_conf_self_video: 'on' | 'off'}) => this.call('zconfiguration.video', parameters);

    zconfiguration.video.camera = {};

    zconfiguration.video.camera.selectedID = (selectedID?: string) => this.call('zconfiguration.video.camera.selectedID', { value: selectedID });

    zconfiguration.video.camera.mirror = (mirror?: 'on' | 'off') => this.call('zconfiguration.video.camera.mirror', { value: mirror });

    zconfiguration.client.appVersion = (appVersion?: string) => this.call('zconfiguration.client.appVersion', { value: appVersion });

    zconfiguration.client.deviceSystem = (deviceSystem?: string) => this.call('zconfiguration.client.deviceSystem', { value: deviceSystem });

    zconfiguration.call.layout = (parameters:{shareThumb?: 'on' | 'off', style?: 'Gallery' | 'Speaker' | 'Strip' | 'ShareAll', size?: 'Off' | 'Size1' | 'Size2' | 'Size3' | 'Strip', position: 'Center' | 'Up' | 'Right' | 'UpRight' | 'Down' | 'DownRight' | 'Left' | 'UpLeft' | 'DownLeft'}) => this.call('zconfiguration.call.layout', parameters);

    zconfiguration.call.lock = (parameters:{enable: boolean}) => this.call('zconfiguration.call.lock', parameters);

    zconfiguration.call.muteUserOnEntry = (parameters:{enable: boolean}) => this.call('zconfiguration.call.muteUserOnEntry', parameters);

    zconfiguration.call.closedCaption = (parameters:{visible?: boolean, fontSize?: 0 | 1 | 2}) => this.call('zconfiguration.call.closedCaption', parameters);

    zstatus.call.status = () => this.call('zstatus.call.status');

    zstatus.audio.input = {};

    zstatus.audio.input.line = () => this.call('zstatus.audio.input.line');

    zstatus.audio.output = {};

    zstatus.audio.output.line = () => this.call('zstatus.audio.output.line');

    zstatus.video.camera = {};

    zstatus.video.camera.line = () => this.call('zstatus.video.camera.line');

    zstatus.video.optimizable = () => this.call('zstatus.video.optimizable');

    zstatus.systemUnit = () => this.call('zstatus.systemUnit');

    zstatus.capabilities = () => this.call('zstatus.capabilities');

    zstatus.sharing = () => this.call('zstatus.sharing');

    zstatus.cameraShare = () => this.call('zstatus.cameraShare');

    zstatus.call.layout = () => this.call('zstatus.call.layout');

    zstatus.call.closedCaption = {};

    zstatus.call.closedCaption.available = () => this.call('zstatus.call.closedCaption.available');

    zstatus.numberOfScreens = () => this.call('zstatus.numberOfScreens');
  }

  async call(command:string, parameters: Object) {
    const response = await superagent.post(`http://127.0.0.1:61340/api/1.0/zoom-room/${command}`).send(parameters);
    return response.body;
  }

  async close() {
    this.shouldReconnect = false;
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
    this.shouldReconnect = false;

    const address = `ws://127.0.0.1:61340/api/1.0/zoom-room/socket/${encodeURIComponent(this.passcode)}`;

    const blendServerDetected = await detectBlend();

    if (!blendServerDetected) {
      this.webSocketLogger.error(`Unable to open web socket connection to ${address}, Blend Server not detected`);
      return;
    }

    const ws = new WebSocket(address);

    let heartbeatInterval;

    ws.onclose = (event) => {
      clearInterval(heartbeatInterval);
      const { wasClean, reason, code } = event;
      if (!wasClean) {
        clearBlendDetection();
      }
      this.webSocketLogger.info(`${wasClean ? 'Cleanly' : 'Uncleanly'} closed websocket connection to ${address} with code ${code}${reason ? `: ${reason}` : ''}`);
      delete this.ws;
      this.emit('close', code, reason);
      this.reconnect();
    };

    ws.onmessage = (event) => {
      try {
        const [type, key, data] = JSON.parse(event.data);
        this.emit(type, key, data);
        console.log({ type, key, data });
      } catch (error) {
        this.webSocketLogger.error(`Unable to parse incoming message: ${event.data}`);
      }
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
    await this.waitForStatus();
    this.shouldReconnect = true;
  }

  reconnect() {
    if (!this.shouldReconnect) {
      return;
    }
    clearTimeout(this.reconnectTimeout);
    clearTimeout(this.reconnectAttemptResetTimeout);
    this.reconnectAttempt += 1;
    const duration = this.reconnectAttempt > 5 ? 25000 + Math.round(Math.random() * 10000) : this.reconnectAttempt * this.reconnectAttempt * 1000;
    console.log(`Reconnect attempt ${this.reconnectAttempt} in ${Math.round(duration / 100) / 10} seconds`);
    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.openWebSocket();
      } catch (error) {
        console.log(`Reconnect attempt ${this.reconnectAttempt} failed: ${error.message}`);
        this.emit('error', error);
        this.shouldReconnect = true;
        setImmediate(() => this.reconnect());
      }
      this.reconnectAttemptResetTimeout = setTimeout(() => {
        this.reconnectAttempt = 0;
      }, 60000);
    }, duration);
  }

  /**
   * Close connection to server.
   * @param {number} [code] Websocket close reason code to send to the server
   * @param {string} [reason] Websocket close reason to send to the server
   * @return {Promise<void>}
   */
  async closeWebSocket(code?: number, reason?: string) {
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
      const onError = (event: Event) => {
        clearTimeout(timeout);
        this.removeListener('close', onClose);
        reject(event);
      };
      this.once('error', onError);
      this.once('close', onClose);
      ws.close(code, reason);
    });
  }

  waitForStatus(topKey?:string, duration?: number = 15000):Promise<Object> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeListener('error', handleError);
        this.removeListener('zStatus', handleStatus);
        reject(new Error('timeout waiting for status'));
      }, duration);
      const handleStatus = (tk:string, top:Object) => {
        if (!topKey || (topKey && tk === topKey)) {
          clearTimeout(timeout);
          this.removeListener('error', handleError);
          this.removeListener('zStatus', handleStatus);
          resolve(top);
        }
      };
      const handleError = (error) => {
        clearTimeout(timeout);
        this.removeListener('error', handleError);
        this.removeListener('zStatus', handleStatus);
        reject(error);
      };
      this.on('zStatus', handleStatus);
      this.on('error', handleError);
    });
  }

  passcode: string;
  port: number;
  resetInProgress: boolean;
  reconnectAttempt: number;
  shouldReconnect: boolean;
  reconnectAttemptResetTimeout: TimeoutID;
  reconnectTimeout: TimeoutID;
  ws: WebSocket;
  webSocketLogger: Object;
  ready: Promise<void>;
  zcommand: Object;
  zconfiguration: Object;
  zstatus: Object;
}
