// lib/cors.ts
import { NextRequest, NextResponse } from "next/server"

export function withCors(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    const res = await handler(req)

    res.headers.set("Access-Control-Allow-Origin", "*")
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, x-user-id")

    return res
  }
}
