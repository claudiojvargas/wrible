import type { MonitorAction, MonitorCandidate } from '@wrible/contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function candidate(value: unknown): MonitorCandidate | undefined {
  if (!isRecord(value)) return;
  const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = value;
  if (typeof candidate !== 'string' || !candidate.startsWith('candidate:') || candidate.length > 2048) return;
  if (sdpMid !== null && (typeof sdpMid !== 'string' || sdpMid.length > 256)) return;
  if (sdpMLineIndex !== null && !boundedInteger(sdpMLineIndex, 0, 65535)) return;
  if (sdpMid === null && sdpMLineIndex === null) return;
  if (usernameFragment != null && (typeof usernameFragment !== 'string' || usernameFragment.length > 256)) return;
  return { candidate, sdpMid, sdpMLineIndex, usernameFragment };
}

export function parseMonitorAction(json: string): MonitorAction | undefined {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return;
  }
  if (!isRecord(value)) return;
  if (value.type === 'join' && (value.role === 'sender' || value.role === 'viewer')) {
    return { type: 'join', role: value.role };
  }
  if (value.type === 'capture' && typeof value.active === 'boolean') {
    return { type: 'capture', active: value.active };
  }
  const { connection } = value;
  if (!boundedInteger(connection, 1, Number.MAX_SAFE_INTEGER)) return;
  if (value.type === 'candidate') {
    const ice = candidate(value.candidate);
    if (ice) return { type: 'candidate', connection, candidate: ice };
  }
  if ((value.type === 'offer' || value.type === 'answer') && typeof value.sdp === 'string'
      && value.sdp.startsWith('v=0') && value.sdp.length <= 48 * 1024) {
    return { type: value.type, connection, sdp: value.sdp };
  }
}
