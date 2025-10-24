import { PinataSDK, UploadResponse } from "pinata";
import "server-only";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: process.env.PINATA_GATEWAY,
});

export interface PinataUploadResult {
  cid: string;
  url: string;
  id: string;
}

export async function uploadFileToIPFS(file: File): Promise<PinataUploadResult> {
  if (!pinata) throw new Error("Pinata SDK not initialised");

  const res: UploadResponse = await pinata.upload.public.file(file, {
    metadata: {
      keyvalues: {
        fileType: file.type,
      },
    },
  });
  const cid = res?.cid;
  if (!cid) throw new Error("Failed to obtain CID");
  const gateway = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs";
  return { cid, url: `${gateway}/${cid}`, id: res?.id };
}

export async function removeFileFromIpfs(id: string): Promise<void> {
  if (!pinata) throw new Error("Pinata SDK not initialised");

  await pinata.files.public.delete([id]);
}
