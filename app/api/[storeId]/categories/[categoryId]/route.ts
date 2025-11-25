import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prismadb from '@/lib/prismadb';

// GET: Retrieve a specific category
export async function GET(
  req: Request,
  context: { params: Promise<{ storeId: string; categoryId: string }> }
) {
  try {
    const { storeId, categoryId } = await context.params;

    if (!storeId || !categoryId) {
      return NextResponse.json(
        { error: 'Store ID and Category ID are required' },
        { status: 400 }
      );
    }

    const category = await prismadb.category.findUnique({
      where: { id: categoryId, storeId },
      include: { Billboard: true },
    });

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    return NextResponse.json(category);
  } catch (error) {
    console.error('[CATEGORY_GET]', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// PATCH: Update a specific category
export async function PATCH(
  req: Request,
  context: { params: Promise<{ storeId: string; categoryId: string }> }
) {
  try {
    const { userId } = await auth();
    const { storeId, categoryId } = await context.params;
    const { name, billboardId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    if (!storeId || !categoryId) {
      return NextResponse.json(
        { error: 'Store ID and Category ID are required' },
        { status: 400 }
      );
    }

    if (!name || !billboardId) {
      return NextResponse.json(
        { error: 'Name and Billboard ID are required' },
        { status: 400 }
      );
    }

    const store = await prismadb.store.findFirst({
      where: { id: storeId, userId },
    });

    if (!store) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const updatedCategory = await prismadb.category.update({
      where: { id: categoryId },
      data: { name, billboardId },
    });

    return NextResponse.json(updatedCategory);
  } catch (error) {
    console.error('[CATEGORY_PATCH]', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// DELETE: Remove a specific category
export async function DELETE(
  req: Request,
  context: { params: Promise<{ storeId: string; categoryId: string }> }
) {
  try {
    const { userId } = await auth();
    const { storeId, categoryId } = await context.params;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    if (!storeId || !categoryId) {
      return NextResponse.json(
        { error: 'Store ID and Category ID are required' },
        { status: 400 }
      );
    }

    const store = await prismadb.store.findFirst({
      where: { id: storeId, userId },
    });

    if (!store) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const deletedCategory = await prismadb.category.delete({
      where: { id: categoryId },
    });

    return NextResponse.json(deletedCategory);
  } catch (error) {
    console.error('[CATEGORY_DELETE]', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
