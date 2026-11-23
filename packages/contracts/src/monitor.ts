export const MONITOR_PATH = '/ws/monitor';
export const MONITOR_ADDRESSES_PATH = '/api/monitor/addresses';
export const MONITOR_VIEWER_REPLACED = 4001;
export const MONITOR_ROLE_TAKEN = 4002;

export type MonitorRole = 'sender' | 'viewer';

export interface MonitorAddress {
  name: string;
  address: string;
}

export interface MonitorCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
}

export type MonitorSignal =
  | { type: 'offer' | 'answer'; connection: number; sdp: string }
  | { type: 'candidate'; connection: number; candidate: MonitorCandidate };

export type MonitorAction =
  | { type: 'join'; role: MonitorRole }
  | { type: 'capture'; active: boolean }
  | MonitorSignal;

export interface MonitorSession {
  type: 'session';
  capture: 'waiting' | 'active' | 'ended';
  connection: number | null;
  viewerConnected: boolean;
}

export type MonitorEvent = MonitorSession | MonitorSignal;
