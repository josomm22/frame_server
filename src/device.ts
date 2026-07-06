import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Persistent, bind-mounted data dir (same volume as the queue). Published
// firmware releases live here so they survive image rebuilds and re-clones —
// see README "Data layout".
const DATA_DIR = path.resolve('data');
const FIRMWARE_DIR = path.join(DATA_DIR, 'firmware');
const FIRMWARE_BIN_PATH = path.join(FIRMWARE_DIR, 'firmware.bin');
const FIRMWARE_VERSION_PATH = path.join(FIRMWARE_DIR, 'version.txt');

// The firmware compares version strings by plain inequality (no semver
// ordering), so publishing an older version deliberately rolls devices back.
export const FIRMWARE_VERSION_RE = /^[0-9A-Za-z._-]{1,32}$/;

// The ESP32 app partition is ~3.3 MB; anything larger is not a valid build.
export const FIRMWARE_MAX_BYTES = 4 * 1024 * 1024;

export interface FirmwareRelease {
  version: string;
  path: string;
  size: number;
}

/**
 * Return the published OTA release, or null if none is published.
 *
 * A release is complete only when both data/firmware/firmware.bin and
 * data/firmware/version.txt exist and the version passes validation; anything
 * partial is treated as unpublished so devices see a clean 404.
 */
export const readFirmwareRelease = async (): Promise<FirmwareRelease | null> => {
  let version: string;
  try {
    version = (await readFile(FIRMWARE_VERSION_PATH, 'utf8')).trim();
  } catch {
    return null;
  }

  if (!FIRMWARE_VERSION_RE.test(version)) {
    console.error(`data/firmware/version.txt contains an invalid version: ${JSON.stringify(version)}`);
    return null;
  }

  let size: number;
  try {
    size = (await stat(FIRMWARE_BIN_PATH)).size;
  } catch {
    return null;
  }

  return { version, path: FIRMWARE_BIN_PATH, size };
};

/**
 * Publish a release: write the binary, then the version marker.
 *
 * Both writes go through a temp file + rename so a device request mid-publish
 * never sees a partial file. The binary lands first so a device that reads the
 * new version string always downloads the matching binary.
 */
export const publishFirmwareRelease = async (version: string, binary: Buffer): Promise<void> => {
  await mkdir(FIRMWARE_DIR, { recursive: true });

  const binTmp = `${FIRMWARE_BIN_PATH}.tmp`;
  await writeFile(binTmp, binary);
  await rename(binTmp, FIRMWARE_BIN_PATH);

  const versionTmp = `${FIRMWARE_VERSION_PATH}.tmp`;
  await writeFile(versionTmp, `${version}\n`, 'utf8');
  await rename(versionTmp, FIRMWARE_VERSION_PATH);
};

// The firmware verifies the flashed image against this header, so it must be
// exactly 32 lowercase hex chars of the served bytes.
export const firmwareMd5 = (binary: Buffer): string =>
  createHash('md5').update(binary).digest('hex');

// ── Device telemetry ─────────────────────────────────────────────────────────

export interface DeviceTelemetry {
  mac: string;
  firmwareVersion: string | null;
  batteryVoltage: number | null;
  batteryPercent: number | null;
  lastSeen: Date;
}

// In-memory by design: devices check in on every wake, so the map repopulates
// within one refresh interval after a server restart.
const devices = new Map<string, DeviceTelemetry>();

export interface RawDeviceHeaders {
  mac: string | undefined;
  firmwareVersion: string | undefined;
  batteryVoltage: string | undefined;
  batteryPercent: string | undefined;
}

/**
 * Validate the telemetry headers a device sent and fold them into the map.
 *
 * Returns the updated entry, or null when there is no valid MAC to key on.
 * Battery headers are omitted by the firmware when the reading failed, so a
 * missing/invalid value keeps the previous reading rather than clearing it.
 */
export const recordDeviceTelemetry = (raw: RawDeviceHeaders): DeviceTelemetry | null => {
  const mac = raw.mac?.trim().toLowerCase() ?? '';
  if (!/^[0-9a-f]{12}$/.test(mac)) return null;

  const prev = devices.get(mac);
  const entry: DeviceTelemetry = {
    mac,
    firmwareVersion: prev?.firmwareVersion ?? null,
    batteryVoltage: prev?.batteryVoltage ?? null,
    batteryPercent: prev?.batteryPercent ?? null,
    lastSeen: new Date(),
  };

  const fw = raw.firmwareVersion?.trim();
  if (fw && FIRMWARE_VERSION_RE.test(fw)) entry.firmwareVersion = fw;

  const volts = parseFloat(raw.batteryVoltage ?? '');
  if (Number.isFinite(volts) && volts >= 0 && volts < 10) entry.batteryVoltage = volts;

  const percent = parseInt(raw.batteryPercent ?? '', 10);
  if (Number.isInteger(percent) && percent >= 0 && percent <= 100) entry.batteryPercent = percent;

  devices.set(mac, entry);
  return entry;
};

/** Devices seen since the server started, most recently seen first. */
export const listDevices = (): DeviceTelemetry[] =>
  [...devices.values()].sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
