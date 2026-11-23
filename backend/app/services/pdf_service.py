import re
from pathlib import Path
from typing import Dict, Any, List
from pypdf import PdfReader

class PDFService:
    @staticmethod
    def extract_text_and_metadata(pdf_path: str) -> Dict[str, Any]:
        """
        Extract raw text, page count, and metadata from a PDF file.
        """
        path = Path(pdf_path)
        if not path.exists():
            raise FileNotFoundError(f"PDF file not found at {pdf_path}")

        try:
            reader = PdfReader(str(path))
            num_pages = len(reader.pages)
            raw_text_parts = []
            page_texts: List[Dict[str, Any]] = []

            for idx, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                clean_page_text = re.sub(r"\s+", " ", text).strip()
                raw_text_parts.append(clean_page_text)
                page_texts.append({"page": idx + 1, "text": clean_page_text})

            full_text = "\n\n".join(raw_text_parts)
            if len(full_text.strip()) < 30:
                raise ValueError("PDF contains no readable text layer (may be a scanned image or protected document).")

            # Metadata extraction from PDF document info
            meta = reader.metadata or {}
            raw_title = meta.get("/Title")
            author = meta.get("/Author")
            
            disclaimers = [
                "provided proper attribution", "google hereby grants", "permission to reproduce",
                "arxiv:", "biorxiv:", "medrxiv:", "permission to make digital", "all rights reserved",
                "proceedings of", "published as a conference", "journal of machine learning",
                "submitted to", "copyright", "ieee", "springer"
            ]

            title = None
            if raw_title and len(str(raw_title).strip()) >= 5:
                cand = str(raw_title).strip()
                if not any(d in cand.lower() for d in disclaimers) and not cand.lower().endswith(".pdf"):
                    title = cand

            # Fallback heuristic: search first page lines or filename stem
            if not title:
                # Derive title candidate from filename
                clean_stem = re.sub(r"^(paper_[a-f0-9]+_|[A-Za-z]+\d{4}_)", "", path.stem)
                clean_stem = clean_stem.replace("_", " ").replace("-", " ").strip().title()

                first_lines = [line.strip() for line in (raw_text_parts[0] if raw_text_parts else "").split("\n") if len(line.strip()) > 10]
                if not first_lines and raw_text_parts:
                    first_lines = [line.strip() for line in raw_text_parts[0].split(". ") if len(line.strip()) > 10]

                valid_line = None
                for line in first_lines[:8]:
                    l_lower = line.lower()
                    if not any(d in l_lower for d in disclaimers) and not re.match(r"^\d+\s*$", line):
                        valid_line = line[:140]
                        break

                title = clean_stem if len(clean_stem) > 8 else (valid_line or clean_stem)

            # DOI extraction regex
            doi_match = re.search(r"10\.\d{4,9}/[-._;()/:A-Z0-9]+", full_text, re.IGNORECASE)
            doi = doi_match.group(0) if doi_match else None

            # Year extraction heuristic
            year_match = re.search(r"\b(19\d{2}|20\d{2})\b", full_text[:2000])
            year = int(year_match.group(1)) if year_match else 2024

            # Abstract extraction heuristic
            abstract = ""
            abstract_match = re.search(r"abstract[\s:—–-]+(.*?)(?:introduction|1\.\s+introduction|keywords|background)", full_text, re.IGNORECASE | re.DOTALL)
            if abstract_match:
                abstract = abstract_match.group(1)[:1500].strip()
            else:
                abstract = full_text[:600].strip()

            return {
                "title": str(title).strip() if title else path.stem,
                "authors": str(author).strip() if author else "Unknown Authors",
                "year": year,
                "doi": doi,
                "abstract": abstract,
                "full_text": full_text,
                "page_count": num_pages,
                "pages": page_texts
            }
        except Exception as e:
            # If corrupted or parsing fails, return informative error
            raise RuntimeError(f"Failed to process PDF: {str(e)}") from e
