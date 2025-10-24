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
