# Smart Literature Claim Mapper

> An interactive research-intelligence platform that extracts verifiable scientific claims, infers cross-study semantic tensions (SUPPORTS, CONTRADICTS, EXTENDS), and synthesizes literature collections into interactive knowledge graphs.

---

## Authors & Academic Attribution

Developed for the Software Engineering Laboratory (Innovative Software Development Assignment):

- **Angshuman Roy (CSM25047)**: PDF Ingestion Pipeline, `PDFService` text extraction, SQLite WAL transaction configuration, automated pytest regression suites.
- **Ayush Paul (CSM25006)**: React 19 Frontend Architecture, Cytoscape.js interactive graph canvas, and responsive workbench views.
- **Ayan Biswas (CSM25032)**: `RelationEngine` inference logic, `ClaimExtractor` normalization, Gemini GenAI grounded Q&A, and database relational schema.

---

## Key Capabilities

1. **Academic PDF Ingestion & Normalization:**
   - Asynchronous PDF parsing with extraction of titles, authors, publication years, DOIs, and abstracts.
   - Heuristic proposition normalization that strips rhetorical scaffolding (e.g., *"we demonstrated that"*, *"our results show that"*) while preserving core scientific findings.
   - Strict text layer verification ($>30$ readable characters) to prevent corrupted or unreadable documents from entering the knowledge graph.

2. **Verifiable Evidence Grounding & Provenance:**
   - Every claim maintains a foreign key relationship to an exact supporting passage in the origin paper.
   - Integrated In-App PDF Reader with sentence-level highlighting and jump-to-page navigation.

3. **Cross-Study Semantic Relation Inference:**
   - Multi-paper relational engine that classifies claim relationships into `SUPPORTS`, `CONTRADICTS`, and `EXTENDS` with calibrated confidence scores.
   - Dense semantic similarity calculation coupled with scientific negation and qualification detection.

4. **Interactive Knowledge Graph Canvas:**
   - High-performance Cytoscape.js canvas supporting multiple topological layout algorithms (`cose`, `concentric`, `circle`).
   - Bidirectional node inspectors, confidence threshold filters, and relation type toggles.

5. **Contradiction & Research Gap Discovery:**
   - Side-by-side comparison of competing scientific hypotheses.
   - Detection of under-explored claims, conceptual isolates, and unaddressed methodology limitations.

6. **Grounded Literature Q&A:**
   - Retrieval-Augmented Generation (RAG) powered by Google Gemini Flash with fallback to offline Reciprocal Rank Fusion (RRF).
   - Strict evidence attribution ensuring synthesis is grounded exclusively in the uploaded corpus.

7. **Human Review & Audit Ledger:**
   - Verification modal allowing researchers to verify, refine, or flag propositions with audit trails.

8. **Standardized Graph Export:**
   - Export corpus datasets into JSON Graph format or GEXF for downstream analysis in Gephi or NetworkX.

---

## System Requirements & Prerequisites

Before running the application, verify that your host environment meets the following specifications:

- **Operating System:** Windows 10/11, macOS 12+, or modern Linux distribution (Ubuntu 20.04+, Debian 11+, Fedora 38+).
- **Python:** Python 3.10 to 3.15.
- **Node.js:** Node.js 18.x or 20.x+ with npm 9.x+.
- **Git:** Git 2.30+ installed and available on your system path.
- **Memory & Storage:** 4 GB RAM minimum (8 GB recommended); 1 GB free disk space.

---

## Installation & Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/not-ayan/literature-mapper.git
cd literature-mapper
```

### 2. Configure Python Virtual Environment

#### On Windows (PowerShell):
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

*(If script execution is blocked on Windows, run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` first).*

#### On Linux / macOS:
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Backend Dependencies

With your virtual environment active, install the required Python packages:

```bash
pip install -r backend/requirements.txt
```

### 4. Install Frontend Dependencies & Build UI

Navigate into the `frontend` directory, install npm packages, and generate the production bundle:

```bash
cd frontend
npm install
npm run build
cd ..
```

The compiled single-page application will be written to `frontend/dist/`.

### 5. Configure Environment Variables (Optional)

Copy the example configuration file to create your local `.env`:

```bash
# On Windows PowerShell:
Copy-Item .env.example .env

# On Linux / macOS:
cp .env.example .env
```

Open `.env` in an editor and set your credentials as needed:

```env
# Optional: Google Gemini API Key for literature synthesis Q&A
# Get an API key from: https://aistudio.google.com/
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: ScraperAPI / ScholarAPI Key for online crawler downloads
SCRAPER_API_KEY=your_scraper_api_key_here

# Model Selection and Confidence Threshold
LITMAP_GEN_MODEL=gemini-2.5-flash
CONFIDENCE_THRESHOLD=0.60
```

*Note: If no API keys are provided, the platform automatically operates using its built-in rule-based NLP extraction, offline reciprocal rank fusion, and deterministic semantic similarity classifier.*

---

## Running the Application

### Option A: Unified Production Mode (Recommended)

In this mode, FastAPI serves both the REST API endpoints and the compiled React production frontend from a single port:

```powershell
# From the project root directory:
python -m uvicorn main:app --app-dir backend --port 8000 --reload
```

- **Application Web UI:** Open [http://localhost:8000](http://localhost:8000)
- **Interactive API Documentation (Swagger UI):** Open [http://localhost:8000/docs](http://localhost:8000/docs)
- **API Health Check:** Open [http://localhost:8000/health](http://localhost:8000/health)

### Option B: Development Mode (Hot-Reloading)

For active frontend and backend development:

**Terminal 1 (Backend API):**
```powershell
python -m uvicorn main:app --app-dir backend --port 8000 --reload
```

**Terminal 2 (Frontend Dev Server):**
```powershell
cd frontend
npm run dev
```

The Vite dev server will start at [http://localhost:5173](http://localhost:5173) and proxy API requests to [http://localhost:8000](http://localhost:8000).

---

## Automated Testing & Quality Assurance

The project includes an automated test suite implemented with `pytest` covering claim normalization, relation classification, graph structural invariants, concurrency safety, and REST endpoints.

To run the test suite:

```powershell
# From the project root directory:
python -m pytest backend/tests -v
```

### Test Coverage Highlights

- `test_claim_normalization`: Verifies canonical proposition filtering and removal of rhetorical scaffolding.
- `test_relation_classification_supports`: Tests concordant proposition scoring against technical thresholds.
- `test_relation_classification_contradicts`: Tests semantic opposition and contradiction detection.
- `test_paper_lifecycle_success_transition`: Validates the `pending` -> `processing` -> `completed` state machine.
- `test_paper_lifecycle_failure_transition`: Ensures unreadable documents transition cleanly to `failed` with recorded error messages.
- `test_graph_structural_invariant_no_dangling_edges`: Confirms graph exports never contain dangling edges referencing absent nodes.
- `test_annotation_state_machine_validation`: Tests human review validation and confidence adjustment logic.
- `test_corpus_reset_clears_all_states`: Verifies that resetting the corpus cleans orphan child entities without foreign key violations.

---

## Repository Structure

```text
literature-mapper/
|-- backend/
|   |-- app/
|   |   |-- api/
|   |   |   `-- endpoints.py             # FastAPI REST route definitions
|   |   |-- core/
|   |   |   |-- config.py                # Environment & directory configurations
|   |   |   `-- database.py              # SQLite engine, WAL pragma, session factory
|   |   |-- models/
|   |   |   `-- schema.py                # SQLAlchemy models (Paper, Claim, Evidence, etc.)
|   |   |-- schemas/
|   |   |   `-- pydantic_models.py       # Request/Response validation schemas
|   |   `-- services/
|   |       |-- claim_extractor.py       # Heuristic proposition normalization & extraction
|   |       |-- embedding_service.py     # Semantic encoding & cosine similarity
|   |       |-- gap_analyzer.py          # Research gap & isolation detection
|   |       |-- gemini_service.py        # Gemini Flash GenAI integration & cascade
|   |       |-- graph_service.py         # Knowledge graph structure builder
|   |       |-- hybrid_retriever.py      # Reciprocal Rank Fusion (RRF) search engine
|   |       |-- pdf_service.py           # Text layer & document metadata parser
|   |       |-- qa_service.py            # Evidence-grounded synthesis service
|   |       `-- relation_engine.py       # Cross-study SUPPORTS/CONTRADICTS/EXTENDS classifier
|   |-- tests/
|   |   |-- test_claim_mapper.py         # Unit tests for core engine components
|   |   `-- test_state_machines.py       # Concurrency and state transition regression tests
|   |-- requirements.txt                 # Backend Python package manifest
|   `-- main.py                          # Application entrypoint & static mount
|-- frontend/
|   |-- src/
|   |   |-- components/
|   |   |   |-- AnnotationModal.tsx      # Proposition verification & audit modal
|   |   |   |-- ClaimExplorerView.tsx    # Filterable claim table & search inspector
|   |   |   |-- ConflictGapView.tsx      # Contradiction comparisons & gap cards
|   |   |   |-- DashboardView.tsx        # Corpus statistics & metrics summary
|   |   |   |-- ExportView.tsx           # JSON and GEXF export generator
|   |   |   |-- GraphVisualizationView.tsx # Cytoscape.js interactive graph
|   |   |   |-- PaperDiscoveryView.tsx   # Scholarly literature discovery & crawler
|   |   |   |-- PaperManagerView.tsx     # Ingested PDF table & upload dropzone
|   |   |   |-- PdfReaderModal.tsx       # Dual-view PDF locator with sentence highlighter
|   |   |   `-- QAView.tsx               # Grounded literature Q&A synthesis
|   |   |-- api.ts                       # Typed frontend HTTP client
|   |   |-- App.tsx                      # Top-level state coordinator & navigation
|   |   |-- index.css                    # Anti-slop design system & color tokens
|   |   |-- main.tsx                     # React root mount
|   |   `-- types.ts                     # TypeScript interface definitions
|   |-- package.json                     # Frontend npm dependencies
|   `-- vite.config.ts                   # Vite bundler & vendor chunking configuration
|-- docs/
|   `-- SRS.md                           # Formal Software Requirements Specification (v1.0)
|-- scrapers/
|   |-- batch_downloader.mjs             # Node.js batch downloading utility
|   |-- downloader.d.ts                  # Type definitions for crawler module
|   `-- downloader.js                    # Multi-source scholarly literature downloader
|-- .env.example                         # Template environment variables
|-- .gitignore                           # Git exclusion rules for caches, builds, and docs
|-- README.md                            # Project overview & running instructions
|-- STATE_MACHINES_AND_USERFLOW.md       # State machine audit, invariants, and userflows
`-- run_app.ps1                          # Convenience launcher script
```

---

## API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Service health status check |
| `GET` | `/api/dashboard/stats` | Aggregated corpus metrics (papers, claims, relations) |
| `GET` | `/api/papers` | Retrieve all ingested papers with metadata |
| `POST` | `/api/papers/upload` | Multipart PDF upload and asynchronous ingestion trigger |
| `DELETE` | `/api/papers/{id}` | Remove paper and cascade-delete child claims and edges |
| `POST` | `/api/corpus/reset` | Purge all papers, claims, evidence, and relations |
| `GET` | `/api/papers/{id}/pdf` | Stream raw PDF for browser or embedded viewer |
| `GET` | `/api/papers/{id}/pages/{p}/text` | Extract single-page text for sentence locator |
| `GET` | `/api/claims` | List and search claims with type and confidence filters |
| `GET` | `/api/claims/{id}` | Detailed claim record with full evidence provenance |
| `GET` | `/api/graph` | Knowledge graph topology (nodes and edges) for Cytoscape |
| `GET` | `/api/conflicts` | Contested claims with paired opposing evidence |
| `GET` | `/api/gaps` | Under-represented propositions and concept isolates |
| `POST` | `/api/qa` | Grounded question answering with citation provenance |
| `POST` | `/api/annotations` | Create human verification audit record |
| `GET` | `/api/export/json` | Download full graph in standard JSON Graph format |
| `GET` | `/api/export/gexf` | Download graph in GEXF format for Gephi |
| `POST` | `/api/crawler/verify-paper` | Verify candidate PDF readability before ingestion |
| `POST` | `/api/crawler/ingest-verified/{id}` | Fast-path ingest pre-verified cached PDF |

---

## License

This project was built for academic evaluation under the Software Engineering Course syllabus. See individual source files for applicable licensing and attribution notices.
