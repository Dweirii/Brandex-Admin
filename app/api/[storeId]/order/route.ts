import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

export async function GET(req: Request) {
    const { userId } = await auth();
    console.log("🔍 Current User ID:", userId);
    if(!userId) return new NextResponse("Unauthorized", {status:401});

    const orders = await prismadb.order.findMany({
        where: { userId },
        include: {
            orderItems: {
                include: {
                    product: true,
                },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    return NextResponse.json(orders);
}