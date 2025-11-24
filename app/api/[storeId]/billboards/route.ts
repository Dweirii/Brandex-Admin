import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prismadb from "@/lib/prismadb";

// Dynamic CORS headers based on origin
const getCorsHeaders = (origin: string | null) => {
  const allowedOrigins = [
    "https://brandexme.com",
    "https://www.brandexme.com",
    "http://localhost:3000",
    "http://localhost:3001",
  ];
  
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : "*";
  
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": allowOrigin !== "*" ? "true" : "false",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
};

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(origin),
  });
}

// POST: Create a new billboard
export async function POST(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
  try {
    const { storeId } = await context.params; // Await params before destructuring
    const { userId } = await auth();
    const body = await req.json();
    const { label, imageUrl } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401, headers: corsHeaders });
    }

    if (!label) {
      return new NextResponse("Label is required", { status: 400, headers: corsHeaders });
    }

    if (!imageUrl) {
      return new NextResponse("Image URL is required", { status: 400, headers: corsHeaders });
    }

    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400, headers: corsHeaders });
    }

    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 403, headers: corsHeaders });
    }

    const billboard = await prismadb.billboard.create({
      data: {
        label,
        imageUrl,
        storeId,
      },
    });

    return NextResponse.json(billboard, { headers: corsHeaders });
  } catch (error) {
    console.error("Error in POST--Billboard", error);
    return new NextResponse("Internal server error", { status: 500, headers: corsHeaders });
  }
}

// GET: Retrieve all billboards for a store
export async function GET(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
  try {
    const { storeId } = await context.params; // Await params before destructuring

    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400, headers: corsHeaders });
    }

    const billboards = await prismadb.billboard.findMany({
      where: {
        storeId,
      },
    });

    return NextResponse.json(billboards, { headers: corsHeaders });
  } catch (error) {
    console.error("Error in GET--Billboard", error);
    return new NextResponse("Internal server error", { status: 500, headers: corsHeaders });
  }
}
