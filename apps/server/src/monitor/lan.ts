import { networkInterfaces } from 'node:os';
import { isIPv4 } from 'node:net';
import type { MonitorAddress } from '@wrible/contracts';

function isLocalIPv4(address: string): boolean {
  if (!isIPv4(address)) return false;
  const [first, second] = address.split('.').map(Number);
  return first === 127 || first === 10
    || (first === 192 && second === 168)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 169 && second === 254);
}

export function isLocalMonitorRequest(host: string | undefined, remote: string | undefined): boolean {
  if (!host || !remote) return false;
  const address = remote.replace(/^::ffff:/i, '');
  if (address !== '::1' && !isLocalIPv4(address)) return false;
  try {
    const { hostname } = new URL(`http://${host}`);
    return hostname === 'localhost' || hostname === '[::1]' || isLocalIPv4(hostname);
  } catch {
    return false;
  }
}

export function monitorAddresses(): MonitorAddress[] {
  const addresses: MonitorAddress[] = [];
  for (const [name, interfaces] of Object.entries(networkInterfaces())) {
    for (const info of interfaces ?? []) {
      if (info.family === 'IPv4' && !info.internal && isLocalIPv4(info.address)) {
        addresses.push({ name, address: info.address });
      }
    }
  }
  return addresses;
}
