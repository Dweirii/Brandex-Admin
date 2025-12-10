import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatter = new Intl.NumberFormat("en-US", {
  style: 'currency',
  currency: 'USD'
});

/**
 * Extracts the file extension from a URL.
 * Handles URLs with query parameters and complex paths.
 * 
 * @param url - The file URL (e.g., from CDN)
 * @returns The file extension in lowercase (e.g., "psd", "png", "mp4") or "bin" as fallback
 * 
 * @example
 * extractFileExtensionFromUrl("https://cdn.com/file.psd?v=123") // => "psd"
 * extractFileExtensionFromUrl("https://cdn.com/path/to/image.PNG") // => "png"
 */
export function extractFileExtensionFromUrl(url: string): string {
  try {
    // Remove query parameters and hash fragments
    const urlWithoutParams = url.split("?")[0].split("#")[0];

    // Get the last part after the last dot
    const parts = urlWithoutParams.split(".");

    if (parts.length < 2) {
      // No extension found, return fallback
      return "bin";
    }

    const extension = parts[parts.length - 1].toLowerCase();

    // Validate that extension looks reasonable (alphanumeric, 2-5 chars typically)
    if (/^[a-z0-9]{2,10}$/i.test(extension)) {
      return extension;
    }

    return "bin";
  } catch (error) {
    console.error("[extractFileExtensionFromUrl] Error:", error);
    return "bin";
  }
}

/**
 * Builds a safe download filename with the correct extension.
 * 
 * @param fileUrl - The source file URL
 * @param baseName - Optional base name for the file (default: "brandex-file")
 * @returns A safe filename with proper extension (e.g., "brandex-file.psd")
 * 
 * @example
 * buildDownloadFilename("https://cdn.com/file.psd") // => "brandex-file.psd"
 * buildDownloadFilename("https://cdn.com/image.png", "logo") // => "logo.png"
 */
export function buildDownloadFilename(fileUrl: string, baseName: string = "brandex-file"): string {
  const extension = extractFileExtensionFromUrl(fileUrl);

  // Sanitize base name (remove special chars, keep alphanumeric, dash, underscore)
  // We keep spaces initially to replace them with dashes/underscores if needed, 
  // but the regex currently strips them. Let's allow spaces then replace them.
  // Actually, let's keep the strict regex but handle empty result.
  let safeName = baseName.replace(/[^a-zA-Z0-9-_]/g, "-");

  // Clean up multiple dashes
  safeName = safeName.replace(/-+/g, "-").replace(/^-|-$/g, "");

  if (!safeName || safeName.length === 0) {
    safeName = "download";
  }

  return `${safeName}.${extension}`;
}