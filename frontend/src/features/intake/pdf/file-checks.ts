import { adapterError } from "@/lib/adapters/shared";
import { fail, ok, type AdapterResult, type ReportLimits } from "@/lib/adapters/types";

// Client-side checks improve feedback only; the report service revalidates
// type, content and page count (FRONTEND_DESIGN.md §15).

const PDF_SIGNATURE = "%PDF-";
// The PDF specification allows the signature anywhere in the first 1,024 bytes.
const SIGNATURE_WINDOW_BYTES = 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

export async function checkReportFile(file: File, limits: ReportLimits): Promise<AdapterResult<void>> {
  const looksLikePdf = file.type === limits.accept || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    return fail(adapterError("UNSUPPORTED_TYPE", `"${file.name}" isn't a PDF. Choose a PDF from your dentist's office.`));
  }
  if (file.size === 0) return fail(adapterError("INVALID", `"${file.name}" is empty. Choose a different file.`));
  if (file.size > limits.maxBytes) {
    return fail(adapterError("TOO_LARGE", `"${file.name}" is ${formatBytes(file.size)}. PDFs can be up to ${formatBytes(limits.maxBytes)}.`));
  }
  let head: string;
  try {
    head = new TextDecoder("latin1").decode(await file.slice(0, SIGNATURE_WINDOW_BYTES).arrayBuffer());
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return fail(adapterError("UNREADABLE", `Your browser couldn't open "${file.name}" (${reason}). Choose it again or pick a different file.`, true));
  }
  if (!head.includes(PDF_SIGNATURE)) {
    return fail(adapterError("UNSUPPORTED_TYPE", `"${file.name}" has a .pdf name but isn't a PDF. Choose a real PDF from your dentist's office.`));
  }
  return ok(undefined);
}
