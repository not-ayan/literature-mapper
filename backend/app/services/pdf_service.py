import re
from pathlib import Path
from typing import Dict, Any, List
from pypdf import PdfReader


class PDFService:
    @staticmethod
    def extract_text_and_metadata(pdf_path: str) -> Dict[str, Any]:
        """Initial PDF text and basic metadata extraction."""
        path = Path(pdf_path)
        if not path.exists():
            raise FileNotFoundError(f"PDF file not found at {pdf_path}")

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
        meta = reader.metadata or {}
        title = str(meta.get("/Title") or path.stem).strip()
        author = str(meta.get("/Author") or "Unknown Authors").strip()

        return {
            "title": title,
            "authors": author,
            "year": 2024,
            "doi": None,
            "abstract": full_text[:500].strip(),
            "full_text": full_text,
            "page_count": num_pages,
            "pages": page_texts,
        }
