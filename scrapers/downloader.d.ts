export interface DiscoveredPaper {
  id: string;
  title: string;
  publication_year: number | string;
  doi?: string;
  authorships?: { author: { display_name: string } }[];
  best_oa_location?: { pdf_url?: string } | null;
  source: string;
  scholar_id?: string;
  isVerified?: boolean;
  verified_id?: string;
  pages?: number;
  size_bytes?: number;
  preview?: string;
  verified_filename?: string;
}


export function searchResearchPapers(
  aiJson: {
    topic?: string;
    keywords: string[];
    limit?: number;
    downloadLimit?: number;
    scraperApiKey?: string;
  },
  onLog?: (msg: string, isGreen?: boolean) => void,
  onProgress?: (pct: number) => void,
  workspaceDirHandle?: any
): Promise<DiscoveredPaper[]>;

export function fetchPaperPdfBlob(
  paper: any,
  onLog?: ((msg: string, isGreen?: boolean) => void) | null,
  customScraperApiKey?: string
): Promise<{ blob: Blob; filename: string }>;

export function runReferenceFinder(): Promise<void>;
export function displayPapers(papersList: any[]): void;
export function downloadPaperPDF(
  paper: any,
  workspaceDirHandle: any,
  onLog?: (msg: string, isGreen?: boolean) => void,
  scraperApiKey?: string
): Promise<{ filename: string; sizeStr: string }>;
export function convertDocumentToMarkdown(
  arrayBuffer: ArrayBuffer,
  filename: string,
  onLog?: (msg: string, isGreen?: boolean) => void
): Promise<string>;
