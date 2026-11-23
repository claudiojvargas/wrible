import type { MonitorCandidate, MonitorRole, MonitorSignal } from '@wrible/contracts';

export type DirectConnection = 'connecting' | 'connected' | 'interrupted' | 'failed';
const CONNECTION_TIMEOUT_MS = 15_000;

interface PeerCallbacks {
  signal: (event: MonitorSignal) => void;
  state: (state: DirectConnection) => void;
  stream: (stream: MediaStream) => void;
}

export class MonitorPeer {
  private readonly peer = new RTCPeerConnection({ iceServers: [] });
  private readonly earlyCandidates: MonitorCandidate[] = [];
  private signalQueue = Promise.resolve();
  private closed = false;
  private deadline?: ReturnType<typeof setTimeout>;

  constructor(readonly id: number, private readonly role: MonitorRole, private readonly callbacks: PeerCallbacks) {
    this.peer.onicecandidate = ({ candidate }) => {
      if (!candidate?.candidate || this.closed) return;
      const { sdpMid, sdpMLineIndex, usernameFragment } = candidate;
      callbacks.signal({
        type: 'candidate', connection: id,
        candidate: { candidate: candidate.candidate, sdpMid, sdpMLineIndex, usernameFragment },
      });
    };
    this.peer.ontrack = ({ streams, track }) => {
      if (!this.closed) callbacks.stream(streams[0] ?? new MediaStream([track]));
    };
    const status = () => {
      const ice = this.peer.iceConnectionState;
      switch (this.peer.connectionState ?? (ice === 'completed' ? 'connected' : ice)) {
        case 'connected':
          this.clearDeadline();
          callbacks.state('connected');
          break;
        case 'disconnected':
          callbacks.state('interrupted');
          this.startDeadline();
          break;
        case 'failed':
          this.fail();
          break;
      }
    };
    this.peer.onconnectionstatechange = status;
    this.peer.oniceconnectionstatechange = status;
    this.startDeadline();
  }

  start(stream: MediaStream) {
    void this.offer(stream).catch(this.fail);
  }

  receive(event: MonitorSignal) {
    this.signalQueue = this.signalQueue.then(async () => {
      if (this.closed) return;
      if (event.type === 'candidate') {
        if (this.peer.remoteDescription) await this.peer.addIceCandidate(event.candidate);
        else if (this.earlyCandidates.length < 128) this.earlyCandidates.push(event.candidate);
        return;
      }

      const expected = this.role === 'viewer' ? 'offer' : 'answer';
      if (event.type !== expected || this.peer.remoteDescription) return;
      await this.peer.setRemoteDescription({ type: event.type, sdp: event.sdp });
      for (const candidate of this.earlyCandidates) await this.peer.addIceCandidate(candidate);
      this.earlyCandidates.length = 0;
      if (this.role === 'viewer' && !this.closed) {
        await this.peer.setLocalDescription(await this.peer.createAnswer());
        this.sendDescription('answer');
      }
    }).catch(this.fail);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.clearDeadline();
    this.earlyCandidates.length = 0;
    this.peer.onicecandidate = null;
    this.peer.ontrack = null;
    this.peer.onconnectionstatechange = null;
    this.peer.oniceconnectionstatechange = null;
    for (const receiver of this.peer.getReceivers()) receiver.track.stop();
    this.peer.close();
  }

  private async offer(stream: MediaStream) {
    for (const track of stream.getVideoTracks()) this.peer.addTrack(track, stream);
    await this.peer.setLocalDescription(await this.peer.createOffer());
    this.sendDescription('offer');
  }

  private sendDescription(type: 'offer' | 'answer') {
    const sdp = this.peer.localDescription?.sdp;
    if (!this.closed && sdp) this.callbacks.signal({ type, connection: this.id, sdp });
  }

  private fail = () => {
    this.clearDeadline();
    if (!this.closed) this.callbacks.state('failed');
  };

  private startDeadline() {
    if (this.deadline === undefined) this.deadline = setTimeout(this.fail, CONNECTION_TIMEOUT_MS);
  }

  private clearDeadline() {
    clearTimeout(this.deadline);
    this.deadline = undefined;
  }
}
