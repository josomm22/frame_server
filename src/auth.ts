import { authenticate } from '@google-cloud/local-auth';
import { OAuth2Client } from 'google-auth-library';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SCOPES = ['https://www.googleapis.com/auth/photospicker.mediaitems.readonly'];

const CREDENTIALS_PATH = path.resolve('credentials.json');
const TOKENS_PATH = path.resolve('data/tokens.json');

async function loadInstalledCreds() {
  const raw = await readFile(CREDENTIALS_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  return parsed.installed ?? parsed.web;
}

async function persistTokens(tokens: unknown) {
  await mkdir(path.dirname(TOKENS_PATH), { recursive: true });
  await writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

export async function getAuthClient(): Promise<OAuth2Client> {
  if (existsSync(TOKENS_PATH)) {
    const saved = JSON.parse(await readFile(TOKENS_PATH, 'utf-8'));
    const creds = await loadInstalledCreds();
    const client = new OAuth2Client(creds.client_id, creds.client_secret);
    client.setCredentials(saved);
    client.on('tokens', async (t) => {
      const merged = { ...saved, ...t };
      await persistTokens(merged);
    });
    return client;
  }

  const client = await authenticate({
    keyfilePath: CREDENTIALS_PATH,
    scopes: SCOPES,
  });
  if (client.credentials) {
    await persistTokens(client.credentials);
  }
  return client;
}
