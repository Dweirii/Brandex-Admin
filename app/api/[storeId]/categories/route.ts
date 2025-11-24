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

// POST: Create a category
export async function POST(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
  try {
    const { storeId } = await context.params; // Await params to access storeId
    const { userId } = await auth();
    const body = await req.json();
    const { name, billboardId } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401, headers: corsHeaders });
    }
    if (!name) {
      return new NextResponse("Name is required", { status: 400, headers: corsHeaders });
    }
    if (!billboardId) {
      return new NextResponse("Billboard ID is required", { status: 400, headers: corsHeaders });
    }

    const store = await prismadb.store.findFirst({
      where: { id: storeId, userId },
    });

    if (!store) {
      return new NextResponse("Unauthorized", { status: 403, headers: corsHeaders });
    }

    const category = await prismadb.category.create({
      data: { name, billboardId, storeId },
    });

    return NextResponse.json(category, { headers: corsHeaders });
  } catch (error) {
    console.error("[CATEGORY_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500, headers: corsHeaders });
  }
}

// GET: Fetch categories
export async function GET(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
  try {
    const { storeId } = await context.params; // Await params to access storeId

    const categories = await prismadb.category.findMany({
      where: { storeId },
    });

    return NextResponse.json(categories, { headers: corsHeaders });
  } catch (error) {
    console.error("[CATEGORY_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500, headers: corsHeaders });
  }
}
