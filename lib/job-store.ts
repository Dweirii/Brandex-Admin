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
    jobStore.set(jobId, { ...existing, ...updates });
  }
}


