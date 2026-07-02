import os

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import partner, transactions
from updater import check_for_updates

app = FastAPI(
    title="Caroline Partner Budget API",
    description="Real-time lightweight partner budgeting backend",
    version="1.0.0",
)

# --- CORS ---
# Allow wide origins in dev; restrict in production
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS.split(",") if CORS_ORIGINS != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- GitHub repo for auto-updates ---
GITHUB_REPO = os.getenv("GITHUB_REPO", "")  # e.g. "owner/repo"
if GITHUB_REPO:
    check_for_updates(
        current_version=app.version,
        github_repo=GITHUB_REPO,
        app_name="Caroline Partner Budget",
    )

# --- API Key authentication ---
from typing import Optional
from fastapi import Header, HTTPException, status, Depends

API_KEY = os.getenv("BACKEND_SECRET_TOKEN", "my-secure-api-key-123")


async def verify_api_key(x_secret_token: Optional[str] = Header(None, alias="X-SECRET-TOKEN")):
    if not x_secret_token or x_secret_token != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Invalid or missing X-SECRET-TOKEN header",
        )


# Include API routers with API Key authentication
app.include_router(partner.router, dependencies=[Depends(verify_api_key)])
app.include_router(transactions.router, dependencies=[Depends(verify_api_key)])


@app.get("/")
async def root():
    return {
        "status": "online",
        "message": "Welcome to the Caroline Partner Budget API. Visit /docs for Swagger UI documentation.",
    }


@app.get("/api/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
