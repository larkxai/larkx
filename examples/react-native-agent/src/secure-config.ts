/** Cloud credentials for this demo. The ingestion key is not written to SQLite or a JSON file. */

export interface CloudConfig {
  readonly projectId: string;
  readonly apiKey: string;
  readonly endpoint: string;
}

const PROJECT = "larkx.cloud.projectId";
const KEY = "larkx.cloud.apiKey";
const ENDPOINT = "larkx.cloud.endpoint";

interface SecureStoreModule {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

function secureStore(): SecureStoreModule | null {
  try {
    // Optional native store. A missing module keeps the key in memory for this launch.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-secure-store") as SecureStoreModule;
  } catch {
    return null;
  }
}

export async function loadCloudConfig(): Promise<CloudConfig | null> {
  const store = secureStore();
  if (store === null) {
    return null;
  }
  const projectId = (await store.getItemAsync(PROJECT)) ?? "";
  const apiKey = (await store.getItemAsync(KEY)) ?? "";
  const endpoint = (await store.getItemAsync(ENDPOINT)) ?? "";
  if (projectId.length === 0 && apiKey.length === 0 && endpoint.length === 0) {
    return null;
  }
  return { projectId, apiKey, endpoint };
}

/** Returns `memory` when the platform store is unavailable. The key is not written to the app database. */
export async function saveCloudConfig(config: CloudConfig): Promise<"stored" | "memory"> {
  const store = secureStore();
  if (store === null) {
    return "memory";
  }
  await write(store, PROJECT, config.projectId);
  await write(store, KEY, config.apiKey);
  await write(store, ENDPOINT, config.endpoint);
  return "stored";
}

async function write(store: SecureStoreModule, key: string, value: string): Promise<void> {
  if (value.length === 0) {
    await store.deleteItemAsync(key);
    return;
  }
  await store.setItemAsync(key, value);
}
