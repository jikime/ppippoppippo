import catalog from '../../device/alerts.json' with { type: 'json' };
import type { Snapshot } from '../simulation/world.ts';

export const KINDS = ['clear','exit_closed','congestion','route_blocked','all_exits_closed','fall','medical','fire','weapon'] as const;
export type AlertKind = typeof KINDS[number];
export type AlertSource = 'simulation' | 'test';
export interface DeviceAlert { kind: Exclude<AlertKind,'clear'>; zone: number; source: AlertSource }
export interface DisplayState { kind: AlertKind; zone: number; source: AlertSource; count: number; fresh: boolean }
export type DeviceId = 'display' | 'beacon';
export interface BeaconTelemetry { audioReady:boolean; muted:boolean; playing:boolean; volume:number; completed:number }
export interface BridgeState { connected: boolean; port: string; lastAck: number | null; acknowledgedRevision: number | null; telemetry?: BeaconTelemetry }
export interface DeviceState {
  epoch: number; revision: number; display: DisplayState; alerts: DeviceAlert[];
  bridge: BridgeState;
  devices: Record<DeviceId, BridgeState>;
}
export { catalog };
export const alertInfo = (kind: AlertKind) => catalog.kinds[KINDS.indexOf(kind)];
export const alertKey = (a: DeviceAlert) => `${a.source}:${a.kind}:${a.zone}`;
export function sortAlerts(alerts: DeviceAlert[]): DeviceAlert[] {
  return [...new Map(alerts.map(a => [alertKey(a), a])).values()].sort((a,b) =>
    alertInfo(b.kind).priority - alertInfo(a.kind).priority ||
    (a.source === b.source ? 0 : a.source === 'simulation' ? -1 : 1) || a.zone - b.zone);
}
export function displayFor(alerts: DeviceAlert[], fresh: boolean): DisplayState {
  const ordered = sortAlerts(alerts), first = ordered[0];
  return { kind: first?.kind ?? 'clear', zone: first?.zone ?? 0, source: first?.source ?? 'simulation', count: ordered.length, fresh };
}
export const isObject = (value: unknown): value is Record<string,unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
export function parseAlerts(value: unknown): DeviceAlert[] {
  if (!Array.isArray(value) || value.length > 32) throw new Error('경고 목록이 올바르지 않습니다.');
  return sortAlerts(value.map(a => {
    if (!isObject(a) || !KINDS.slice(1).includes(a.kind as DeviceAlert['kind']) || !integer(a.zone,0,3) ||
      (a.source !== 'simulation' && a.source !== 'test')) throw new Error('경고 형식이 올바르지 않습니다.');
    return { kind: a.kind as DeviceAlert['kind'], zone: a.zone, source: a.source };
  }));
}

// Entry and exit thresholds differ to avoid repeatedly flashing warnings near a boundary.
export class SimulationAlerts {
  private revision = -1;
  private congestionSince: number | null = null;
  private clearSince: number | null = null;
  private blockedSince: number | null = null;
  private congestion = false;
  update(snapshot: Snapshot, now: number): DeviceAlert[] {
    if (snapshot.revision !== this.revision || !snapshot.ready) {
      this.revision = snapshot.revision;
      this.congestionSince = this.clearSince = this.blockedSince = null;
      this.congestion = false;
    }
    if (!snapshot.ready || snapshot.error) return [];
    const result: DeviceAlert[] = [];
    const add = (kind: DeviceAlert['kind'], zone = 0) => result.push({kind,zone,source:'simulation'});
    const closed = snapshot.exits.filter(e => !e.open);
    if (closed.length === 3 && snapshot.inside > 0) add('all_exits_closed');
    else closed.forEach(e => add('exit_closed', ['A','B','C'].indexOf(e.id) + 1));
    if (snapshot.waiting >= 13) {
      this.clearSince = null;
      this.congestionSince ??= now;
      if (now - this.congestionSince >= 5000) this.congestion = true;
    } else {
      this.congestionSince = null;
      if (snapshot.waiting <= 8) {
        this.clearSince ??= now;
        if (now - this.clearSince >= 5000) this.congestion = false;
      } else this.clearSince = null;
    }
    if (this.congestion) add('congestion');
    if (snapshot.blocked > 0) {
      this.blockedSince ??= now;
      if (now - this.blockedSince >= 3000 && closed.length !== 3) add('route_blocked');
    } else this.blockedSince = null;
    return sortAlerts(result);
  }
}
