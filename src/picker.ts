import type { OAuth2Client } from 'google-auth-library';

const BASE = 'https://photospicker.googleapis.com/v1';

export interface Session {
  id: string;
  pickerUri: string;
  pollingConfig?: { pollInterval?: string; timeoutIn?: string };
  expireTime?: string;
  mediaItemsSet?: boolean;
}

export interface MediaItem {
  id: string;
  createTime?: string;
  type?: string;
  mediaFile: {
    baseUrl: string;
    mimeType: string;
    filename?: string;
    mediaFileMetadata?: {
      width?: string | number;
      height?: string | number;
    };
  };
}

async function authedFetch(client: OAuth2Client, url: string, init?: RequestInit) {
  const headers = await client.getRequestHeaders(url);
  return fetch(url, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
}

export async function createSession(client: OAuth2Client): Promise<Session> {
  const r = await authedFetch(client, `${BASE}/sessions`, { method: 'POST' });
  if (!r.ok) throw new Error(`createSession ${r.status}: ${await r.text()}`);
  return r.json() as Promise<Session>;
}

export async function getSession(client: OAuth2Client, id: string): Promise<Session> {
  const r = await authedFetch(client, `${BASE}/sessions/${id}`);
  if (!r.ok) throw new Error(`getSession ${r.status}: ${await r.text()}`);
  return r.json() as Promise<Session>;
}

export async function listMediaItems(
  client: OAuth2Client,
  sessionId: string,
): Promise<MediaItem[]> {
  const items: MediaItem[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${BASE}/mediaItems`);
    url.searchParams.set('sessionId', sessionId);
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const r = await authedFetch(client, url.toString());
    if (!r.ok) throw new Error(`listMediaItems ${r.status}: ${await r.text()}`);
    const data = (await r.json()) as { mediaItems?: MediaItem[]; nextPageToken?: string };
    if (data.mediaItems) items.push(...data.mediaItems);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

export async function deleteSession(client: OAuth2Client, id: string): Promise<void> {
  const r = await authedFetch(client, `${BASE}/sessions/${id}`, { method: 'DELETE' });
  if (!r.ok && r.status !== 404) {
    throw new Error(`deleteSession ${r.status}: ${await r.text()}`);
  }
}

export async function downloadMediaItem(
  client: OAuth2Client,
  item: MediaItem,
  width: number,
  height: number,
): Promise<Buffer> {
  const url = `${item.mediaFile.baseUrl}=w${width}-h${height}`;
  const headers = await client.getRequestHeaders(url);
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`download ${r.status}: ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}
