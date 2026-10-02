import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
EXPORT_DIR = DATA_DIR / "exports"

# Auto-load .env from project root or backend directory if present
def _load_env():
    possible_envs = [
        BASE_DIR.parent / ".env",  # Root workspace: d:\Claim_mapper\.env
        BASE_DIR / ".env",         # Backend directory: d:\Claim_mapper\backend\.env
        Path.cwd() / ".env"
    ]
    for env_path in possible_envs:
        if env_path.exists():
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip('"').strip("'")
                            if k and k not in os.environ:
                                os.environ[k] = v
            except Exception:
                pass

_load_env()

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
VERIFIED_CACHE_DIR = DATA_DIR / "verified_cache"
VERIFIED_CACHE_DIR.mkdir(parents=True, exist_ok=True)


DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'claims_mapper.db'}")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
SCRAPER_API_KEY = os.getenv("SCRAPER_API_KEY") or os.getenv("SCHOLAR_API_KEY") or ""
LITMAP_GEN_MODEL = os.getenv("LITMAP_GEN_MODEL", "gemini-2.5-flash")

DEFAULT_CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.60"))

