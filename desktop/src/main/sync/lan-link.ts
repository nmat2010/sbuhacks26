import type { NetworkInterfaceInfo } from 'os';
import type Database from 'better-sqlite3';
import type { DeviceType, PairedDeviceType, PlanSnapshotType, RequestFollowup, RequestHints, StreakSnapshotType } from '@wolfie/shared';
import type { SyncInfo } from '../../common/ipc-sensing.js';
import { TypedEmitter } from '../typed-emitter.js';
import { lanAddresses } from './lan-auth.js';
import { LanServer } from './lan-server.js';
import { PairingCode } from './pairing-code.js';
import { snapshotEvents } from './snapshots.js';

// Composition of the LAN side (A8) with no Electron imports: server + pairing code + the info the
// pairing screen needs. register.ts supplies the real singletons; tests supply fakes.

export interface LanLinkDeps {
  port: number;
  host?: string;
  db: () => Database.Database;
  now: () => number;
  getDevices: () => PairedDeviceType[];
  setDevices: (devices: PairedDeviceType[]) => void;
  hints: { requestHints: RequestHints; requestFollowup: RequestFollowup };
  getPlanSnapshot: () => PlanSnapshotType;
  getStreakSnapshot: () => StreakSnapshotType;
  logEvent: (type: `${string}.${string}`, payload: Record<string, unknown>, opts: { device: DeviceType; ts: number; db: Database.Database }) => void;
  networkInterfaces: () => Record<string, NetworkInterfaceInfo[] | undefined>;
  onSessionEnded?: (info: { sessionId: string; startedAt: number; endedAt: number }) => void;
  pairingCode?: PairingCode;
  helloTimeoutMs?: number;
}

export interface LanLink {
  server: LanServer;
  pairingCode: PairingCode;
  events: TypedEmitter<{ changed: [info: SyncInfo] }>;
  getInfo(): SyncInfo;
  regenerateCode(): SyncInfo;
  unpair(deviceId: string): SyncInfo;
  stop(): Promise<void>;
}

export async function startLanLink(deps: LanLinkDeps): Promise<LanLink> {
  const pairingCode = deps.pairingCode ?? new PairingCode({ now: deps.now });
  const server = new LanServer({
    host: deps.host,
    port: deps.port,
    db: deps.db,
    now: deps.now,
    pairingCode,
    getDevices: deps.getDevices,
    setDevices: deps.setDevices,
    hints: deps.hints,
    getPlanSnapshot: deps.getPlanSnapshot,
    getStreakSnapshot: deps.getStreakSnapshot,
    logEvent: deps.logEvent,
    onSessionEnded: deps.onSessionEnded,
    helloTimeoutMs: deps.helloTimeoutMs
  });
  const port = await server.start();
  if (port === null) console.error(`[sync] could not listen on port ${deps.port}; web app sync is off`);
  else console.log(`[sync] LAN server listening on port ${port}`);

  const events = new TypedEmitter<{ changed: [info: SyncInfo] }>();
  const getInfo = (): SyncInfo => {
    const { code, expiresAt } = pairingCode.current();
    return {
      listening: port !== null,
      port,
      addresses: lanAddresses(deps.networkInterfaces()),
      code,
      codeExpiresAt: expiresAt,
      devices: deps
        .getDevices()
        .map((d) => ({ deviceId: d.deviceId, name: d.name, pairedAt: d.pairedAt, connected: server.isConnected(d.deviceId) }))
    };
  };

  const offs = [
    server.events.on('devices', () => events.emit('changed', getInfo())),
    snapshotEvents.on('changed', (which) => server.pushSnapshots(which))
  ];

  return {
    server,
    pairingCode,
    events,
    getInfo,
    regenerateCode() {
      pairingCode.regenerate();
      return getInfo();
    },
    unpair(deviceId) {
      server.unpair(deviceId);
      return getInfo();
    },
    async stop() {
      offs.forEach((off) => off());
      await server.stop();
    }
  };
}
