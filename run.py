"""Entry point: python run.py"""

import os
import uvicorn

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "127.0.0.1")
    reload = host == "127.0.0.1"  # Only reload in local dev
    uvicorn.run(
        "backend.main:app",
        host=host,
        port=port,
        reload=reload,
        reload_dirs=["backend", "frontend"] if reload else None,
        reload_excludes=["*.db", "*.db-journal", "*.db-wal"] if reload else None,
    )
