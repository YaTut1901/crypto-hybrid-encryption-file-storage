import { createAccBuilder } from "@lit-protocol/access-control-conditions";
import { createAuthManager, storagePlugins } from "@lit-protocol/auth";
import { createLitClient } from "@lit-protocol/lit-client";
import { nagaDev } from "@lit-protocol/networks";
import { WalletClient } from "viem";

export interface AesEncryptedFile {
  file: File;
  key: string;
}

function bufToHex(ab: ArrayBuffer): string {
  return Array.from(new Uint8Array(ab))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function encryptFileWithAes(file: File): Promise<AesEncryptedFile> {
  const plainBuf: ArrayBuffer = await file.arrayBuffer();
  const key: CryptoKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv: Uint8Array = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuf: ArrayBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plainBuf,
  );

  // prepend IV to ciphertext
  const combined = new Uint8Array(iv.byteLength + encryptedBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuf), iv.byteLength);

  const encryptedFile: File = new File([combined], file.name + ".enc", { type: "application/octet-stream" });

  // export key -> hex string
  const rawKey: ArrayBuffer = await crypto.subtle.exportKey("raw", key);
  const keyHex: string = bufToHex(rawKey);

  return { file: encryptedFile, key: keyHex };
}

export async function decryptFileWithAes(file: Blob, keyString: string, fileType: string): Promise<File> {
  const plainBuf: ArrayBuffer = await file.arrayBuffer();
  const key: CryptoKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(Buffer.from(keyString, "hex")),
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const iv: ArrayBuffer = plainBuf.slice(0, 12);
  const encryptedBuf: ArrayBuffer = plainBuf.slice(12);
  const decryptedBuf: ArrayBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, encryptedBuf);
  return new File([decryptedBuf], "decrypted.file", { type: fileType });
}

// Lazy initialization to avoid connection on module load
let litClientInstance: Awaited<ReturnType<typeof createLitClient>> | null = null;
let authManagerInstance: Awaited<ReturnType<typeof createAuthManager>> | null = null;
const eoaAuthContextCache: Record<string, Promise<any>> = {};

async function getEoaAuthContext(walletClient: WalletClient) {
  const authManager = await getAuthManager();
  const litClient = await getLitClient();

  const address = walletClient.account?.address?.toLowerCase();
  if (!address) throw new Error("No wallet address");

  if (!eoaAuthContextCache[address]) {
    eoaAuthContextCache[address] = authManager.createEoaAuthContext({
      config: { account: walletClient },
      authConfig: {
        domain: typeof window !== "undefined" ? window.location.host : "localhost",
        statement: "Decrypt lit data",
        expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        resources: [
          ["access-control-condition-decryption", "*"],
          ["lit-action-execution", "*"],
        ],
      },
      litClient,
    });
  }
  return eoaAuthContextCache[address];
}

async function getLitClient() {
  if (!litClientInstance) {
    litClientInstance = await createLitClient({
      network: nagaDev,
    });
  }
  return litClientInstance;
}

async function getAuthManager() {
  if (!authManagerInstance) {
    authManagerInstance = await createAuthManager({
      storage: storagePlugins.localStorage({
        appName: "crypto-files",
        networkName: "naga-dev",
      }),
    });
  }
  return authManagerInstance;
}

export interface EncryptedKey {
  ciphertext: string;
  dataToEncryptHash: string;
}

export async function encryptKeyWithLit(key: string, walletAddress: string): Promise<EncryptedKey> {
  const litClient = await getLitClient();
  const acc = createAccBuilder().requireWalletOwnership(walletAddress).on("ethereum").build();

  const encrypted = await litClient.encrypt({
    dataToEncrypt: key,
    unifiedAccessControlConditions: acc,
    chain: "ethereum",
  });
  return { ciphertext: encrypted.ciphertext, dataToEncryptHash: encrypted.dataToEncryptHash } as EncryptedKey;
}

export async function decryptKeyWithLit(key: string, walletClient: WalletClient): Promise<string> {
  const [ciphertext, dataToEncryptHash] = key.split(":");

  const litClient = await getLitClient();

  const acc = createAccBuilder()
    .requireWalletOwnership(walletClient.account?.address ?? "")
    .on("ethereum")
    .build();

  const authContext = await getEoaAuthContext(walletClient);

  const decryptedResponse = await litClient.decrypt({
    data: {
      ciphertext: ciphertext,
      dataToEncryptHash: dataToEncryptHash,
    },
    unifiedAccessControlConditions: acc,
    authContext: authContext,
    chain: "ethereum",
  });

  return new TextDecoder().decode(decryptedResponse.decryptedData);
}
