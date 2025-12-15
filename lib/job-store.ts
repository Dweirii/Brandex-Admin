// Shared job store for tracking Inngest job status
// In production, use Redis or database for persistence

interface GeneratedProduct {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  imageUrl: string;
  downloadUrl: string;
  keywords: string[];
}

interface JobStatus {
  status: "pending" | "processing" | "completed" | "failed";
  products?: GeneratedProduct[];
  processed?: number;
  failed?: number;
  total?: number;
  error?: string;
  createdAt: number;
}

const jobStore = new Map<string, JobStatus>();

export function getJob(jobId: string): JobStatus | undefined {
  return jobStore.get(jobId);
}

export function setJob(jobId: string, status: JobStatus): void {
  jobStore.set(jobId, status);
}

export function hasJob(jobId: string): boolean {
  return jobStore.has(jobId);
}

export function updateJob(jobId: string, updates: Partial<JobStatus>): void {
  const existing = jobStore.get(jobId);
  if (existing) {
    // Accumulate numeric values (processed, failed) instead of overwriting
    const accumulatedUpdates: Partial<JobStatus> = { ...updates };
    
    // Accumulate processed count
    if (updates.processed !== undefined) {
      accumulatedUpdates.processed = (existing.processed || 0) + updates.processed;
    }
    
    // Accumulate failed count
    if (updates.failed !== undefined) {
      accumulatedUpdates.failed = (existing.failed || 0) + updates.failed;
    }
    
    // Merge products arrays (limit to first 100)
    if (updates.products) {
      const existingProducts = existing.products || [];
      const mergedProducts = [...existingProducts, ...updates.products];
      accumulatedUpdates.products = mergedProducts.slice(0, 100);
    }
    
    // Update total if provided (should be the same across all events)
    if (updates.total !== undefined) {
      accumulatedUpdates.total = updates.total;
    }
    
    jobStore.set(jobId, { ...existing, ...accumulatedUpdates });
  }
}


