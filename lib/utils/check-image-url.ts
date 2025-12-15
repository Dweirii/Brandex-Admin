/**
 * Checks if an image URL is accessible (not 404)
 * Uses HEAD request for efficiency
 */
export async function isImageUrlValid(url: string): Promise<boolean> {
  if (!url || url.trim() === "") {
    return false;
  }

  try {
    // Use HEAD request to check if resource exists without downloading
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ImageValidator/1.0)",
      },
    });

    clearTimeout(timeoutId);

    // Consider 200-299 and 300-399 as valid (redirects are OK)
    return response.status >= 200 && response.status < 400;
  } catch (error) {
    // Network errors, timeouts, or invalid URLs are considered invalid
    return false;
  }
}

/**
 * Checks if a product has at least one valid image
 * Returns true if product has valid images or has a videoUrl
 */
export async function hasValidMedia(
  images: Array<{ url: string }> | null | undefined,
  videoUrl: string | null | undefined
): Promise<boolean> {
  // If product has a video URL, consider it valid
  if (videoUrl && videoUrl.trim() !== "") {
    return true;
  }

  // If no images, product is invalid
  if (!images || images.length === 0) {
    return false;
  }

  // Check all images in parallel
  const imageChecks = await Promise.allSettled(
    images.map((img) => isImageUrlValid(img.url))
  );

  // Product is valid if at least one image is valid
  return imageChecks.some(
    (result) => result.status === "fulfilled" && result.value === true
  );
}

/**
 * Filters products to only include those with valid media
 * Checks images in parallel for efficiency
 */
export async function filterProductsWithValidMedia<T extends {
  Image?: Array<{ url: string }> | null;
  videoUrl?: string | null | undefined;
}>(
  products: T[]
): Promise<T[]> {
  if (products.length === 0) {
    return products;
  }

  // Check all products in parallel
  const validityChecks = await Promise.allSettled(
    products.map((product) =>
      hasValidMedia(product.Image || null, product.videoUrl || null)
    )
  );

  // Filter products that have valid media
  return products.filter((_, index) => {
    const result = validityChecks[index];
    return result.status === "fulfilled" && result.value === true;
  });
}

