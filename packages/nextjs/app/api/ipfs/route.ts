import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const GATEWAYS = [
  (cid: string) => `https://gateway.pinata.cloud/ipfs/${cid}`,
  (cid: string) => `https://cloudflare-ipfs.com/ipfs/${cid}`,
  (cid: string) => `https://ipfs.io/ipfs/${cid}`,
];

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const cid = searchParams.get("cid");
    if (!cid) return new NextResponse("Missing cid", { status: 400 });

    for (const gw of GATEWAYS) {
      try {
        const res = await fetch(gw(cid), {
          // Avoid caching issues during dev; adjust as needed
          cache: "no-store",
        });
        if (res.ok) {
          const headers = new Headers(res.headers);
          headers.set("Access-Control-Allow-Origin", "*");
          headers.delete("content-security-policy");
          return new Response(res.body, {
            status: res.status,
            headers,
          });
        }
      } catch (err) {
        console.error("Failed to fetch from gateway %s: %s", gw(cid), err);
      }
    }
    return new NextResponse("Failed to fetch from gateways", { status: 502 });
  } catch (err) {
    console.error("/api/ipfs error", err);
    return new NextResponse("Server error", { status: 500 });
  }
}
