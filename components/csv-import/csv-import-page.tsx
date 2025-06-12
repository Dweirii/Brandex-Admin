"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import Papa from "papaparse";
import { toast } from "react-hot-toast";
import { UploadCloud, AlertCircle, Table } from "lucide-react";
import {
  validateProductBatch,
  type ProductImportRow,
  type ValidatedProductImportRow,
} from "@/lib/validation/product-import-schema";
import { exportFailedRowsAsCsv } from "@/lib/utils/export-failed-rows";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { TableBody, TableCell, TableHeader, TableRow } from "../ui/table";
import { Progress } from "../ui/progress";

interface CsvImportPageProps {
  storeId: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface ImportResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: ValidationError[];
  failedRows: ProductImportRow[];
  importId?: string;
}

export default function CsvImportPage({ storeId }: CsvImportPageProps) {
  const [rows, setRows] = useState<ValidatedProductImportRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setImportResult(null);

    Papa.parse<ProductImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const { validRows, errors } = validateProductBatch(results.data);
        setRows(validRows);
        setValidationErrors(errors);

        // Replace ternary with if/else to satisfy no-unused-expressions
        if (errors.length) {
          toast.error("Validation failed. Please review the issues.");
        } else {
          toast.success(`Parsed ${validRows.length} rows successfully.`);
        }
      },
      error: ({ message }) => {
        toast.error(`Parsing error: ${message}`);
      },
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    maxSize: 5 * 1024 * 1024,
    multiple: false,
  });

  const handleImport = async (): Promise<void> => {
    if (!rows.length) return;
    setIsUploading(true);
    setUploadProgress(10);

    const interval = setInterval(() => {
      setUploadProgress((p) => Math.min(p + 15, 90));
    }, 300);

    try {
      const res = await fetch(`/api/${storeId}/products/bulk-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, items: rows }),
      });
      clearInterval(interval);
      setUploadProgress(100);
      const result: ImportResult = await res.json();
      setImportResult(result);

      // Replace ternary with if/else to satisfy no-unused-expressions
      if (result.success) {
        toast.success(`Imported ${result.processed} products.`);
      } else {
        toast.error(`Import completed with ${result.failed} failures.`);
      }
    } catch {
      clearInterval(interval);
      toast.error("Import failed. Try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleExportFailedRows = (): void => {
    if (importResult?.failedRows.length) {
      exportFailedRowsAsCsv(importResult.failedRows);
      toast.success("Failed rows exported.");
    }
  };

  const hasErrors = validationErrors.length > 0;
  const canStart = rows.length > 0 && !hasErrors && !isUploading;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Product CSV Import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            {...getRootProps()}
            className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg hover:border-primary transition-colors cursor-pointer"
          >
            <UploadCloud className="mb-2 h-8 w-8 text-muted-foreground" />
            <input {...getInputProps()} />
            <p className="text-center text-sm text-muted-foreground">
              {isDragActive
                ? "Drop CSV to upload"
                : "Drag & drop CSV, or click to select file"}
            </p>
          </div>

          {rows.length > 0 && (
            <div className="text-sm text-foreground">Rows ready: {rows.length}</div>
          )}

          {hasErrors && (
            <Alert variant="destructive">
              <AlertCircle className="h-5 w-5" />
              <AlertTitle>{validationErrors.length} Validation Issues</AlertTitle>
              <AlertDescription>
                Review the CSV file and correct errors before proceeding.
              </AlertDescription>
            </Alert>
          )}

          {isUploading && <Progress value={uploadProgress} className="h-2" />}

          <Button
            onClick={handleImport}
            disabled={!canStart}
            className="w-full"
          >
            {isUploading ? "Uploading..." : "Start Import"}
          </Button>

          {importResult && (
            <Alert
              variant={importResult.success ? "default" : "destructive"}
            >
              <AlertTitle>
                {importResult.success
                  ? `Imported: ${importResult.processed}`
                  : `Failed: ${importResult.failed}`}
              </AlertTitle>
              {!importResult.success && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportFailedRows}
                >
                  Export Failed Rows
                </Button>
              )}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Preview first 5 rows */}
      {rows.length > 0 && !hasErrors && (
        <Card>
          <CardHeader>
            <CardTitle>Preview Rows (First 5)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {Object.keys(rows[0]).map((key, idx) => (
                    <TableCell key={idx} className="font-medium">
                      {key}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 5).map((row, idx) => (
                  <TableRow key={idx}>
                    {Object.values(row).map((val, i) => (
                      <TableCell key={i}>{String(val)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
