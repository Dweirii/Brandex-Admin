
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prismadb from "@/lib/prismadb";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ storeId: string; importId: string }> }
) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { storeId, importId } = await params;

        const importLog = await prismadb.product_import_logs.findUnique({
            where: {
                id: importId,
            },
        });

        if (!importLog) {
            return new NextResponse("Import log not found", { status: 404 });
        }

        // Verify ownership
        if (importLog.storeId !== storeId) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        return NextResponse.json(importLog);
    } catch (error) {
        console.error("[IMPORT_STATUS_GET]", error);
        return new NextResponse("Internal error", { status: 500 });
    }
}
