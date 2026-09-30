# Software Requirements Specification (SRS)
## Smart Literature Claim Mapper
**Version:** 1.0 — Initial / Proposed System  
**Date:** 11 September 2026  
**Domain:** Research Intelligence / Academic Literature Analysis  
**Prepared For:** Software Engineering Laboratory  
**Presenters:** Ayush Paul (Csm25006), Ayan Biswas (Csm25032), Angshuman Roy (Csm25047)  

---

### 1. Introduction & Vision
- **Purpose:** Transform academic PDF collections into an explorable claim-and-evidence knowledge graph.
- **Core Value:** Enable researchers to discover scientific claims, inspect supporting/contradicting/extending evidence, explore citation networks, detect conflicting findings, and identify research gaps with end-to-end evidence traceability.

---

### 2. Core Entities & Data Model
- **Paper:** `paper_id`, `title`, `authors`, `year`, `DOI`, `file_path`, `abstract`, `processing_status`
- **Claim:** `claim_id`, `claim_text`, `normalized_text`, `claim_type`, `confidence`, `paper_id`, `section/location`
- **Evidence:** `evidence_id`, `claim_id`, `paper_id`, `text`, `page/section`, `extraction_confidence`
- **ClaimRelation:** `relation_id`, `source_claim_id`, `target_claim_id`, `relation_type` (`SUPPORTS`, `CONTRADICTS`, `EXTENDS`), `confidence`, `evidence_id`
- **Concept:** `concept_id`, `name`, `category`, `confidence`
- **Citation:** `source_paper_id`, `target_paper_id`, `citation_metadata`
- **Annotation:** `annotation_id`, `target_id`, `user/action`, `corrected_value`, `comment`, `timestamp`

---

### 3. Key Functional Modules
1. **Corpus & PDF Ingestion (FR-01 to FR-03, FR-21, FR-22):** PDF parsing, text & metadata extraction, status tracking, robust error handling.
2. **Claim & Evidence Extraction (FR-04 to FR-06):** Extract findings, normalize claims into canonical forms, link claims to exact evidence passages.
3. **Semantic Relation & Conflict Engine (FR-07, FR-08, FR-15):** Classify pairs as `SUPPORTS`, `CONTRADICTS`, or `EXTENDS`; compute confidence; flag conflicting claims.
4. **Research Gap & Synthesis Engine (FR-16, FR-18):** Identify under-explored claims and disconnected concepts; provide grounded Q&A with direct citation provenance.
5. **Interactive Graph & Explorer (FR-09 to FR-14):** Interactive visualization (Cytoscape.js / React Flow), multi-criteria filtering, evidence inspector, citation graph navigation.
6. **Dashboard & Annotations (FR-17, FR-19, FR-20):** High-level metrics, human correction/annotation interface, export capability (JSON/GEXF).

---

### 4. Technical Architecture
- **Backend:** Python + FastAPI (Modular service architecture, SQLite database layer, async background worker for ingestion/extraction).
- **Frontend:** React + TypeScript (Vite, modern responsive UI, Cytoscape.js / React Flow interactive graph canvas).
- **Intelligence/NLP:** Extensible NLP/LLM service integration for extraction, semantic embeddings, and grounded synthesis with fallback local heuristics/mock models for testing.
