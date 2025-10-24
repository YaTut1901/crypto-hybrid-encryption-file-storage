import { NextRequest, NextResponse } from "next/server";
import { PinataUploadResult, removeFileFromIpfs, uploadFileToIPFS } from "~~/utils/upload/server";

export const runtime = "edge";

interface ErrorResponse {
  error: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<PinataUploadResult | ErrorResponse>> {
  try {
    const formData: FormData = await req.formData();
    const fileEntry: FormDataEntryValue | null = formData.get("file");

    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "File field missing" }, { status: 400 });
    }

    const result: PinataUploadResult = await uploadFileToIPFS(fileEntry);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Upload error", err);
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse<void | ErrorResponse>> {
  try {
    const formData: FormData = await req.formData();
    const id: string | null = formData.get("id") as string | null;
    if (!id) throw new Error("ID field missing");
    await removeFileFromIpfs(id);
    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("Delete failed", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 as const });
  }
}
