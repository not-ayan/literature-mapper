import re
import uuid
from typing import List, Dict, Any, Optional


class ClaimExtractor:
    @staticmethod
    def normalize_claim(text: str) -> str:
        return re.sub(r"\s+", " ", text.lower().strip())[:300]

    @classmethod
    def extract_claims_and_evidence(
        cls, full_text: str, pages: List[Dict[str, Any]], gemini_api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        claim_patterns = [
            (r"(?:we\s+(?:find|demonstrate|show|observe|prove|conclude)\s+that\s+([^.\n]{20,200}\.))", "finding", 0.90),
            (r"(?:we\s+(?:propose|introduce|develop|present)\s+(?:a\s+new|an|the)?\s+([^.\n]{20,200}\.))", "method", 0.85),
            (r"(?:a\s+major\s+(?:limitation|drawback|constraint)\s+(?:of|in)\s+([^.\n]{20,200}\.))", "limitation", 0.86),
        ]
        extracted_claims = []
        sentences = re.split(r"(?<=[.!?])\s+", full_text)

        for sentence in sentences:
            s_clean = sentence.strip()
            if len(s_clean) < 25 or len(s_clean) > 350:
                continue
            for pattern, c_type, base_conf in claim_patterns:
                if re.search(pattern, s_clean, re.IGNORECASE):
                    extracted_claims.append({
                        "claim_id": f"claim_{uuid.uuid4().hex[:10]}",
                        "claim_text": s_clean,
                        "normalized_text": cls.normalize_claim(s_clean),
                        "claim_type": c_type,
                        "confidence": base_conf,
                        "section_location": "Page 1",
                        "evidence": {
                            "evidence_id": f"ev_{uuid.uuid4().hex[:10]}",
                            "text": s_clean,
                            "page_section": "Page 1",
                            "extraction_confidence": round(base_conf * 0.95, 2),
                        },
                    })
                    break

        return {"claims": extracted_claims, "concepts": []}
