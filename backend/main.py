import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import partner, transactions
from updater import check_for_updates

app = FastAPI(
    title="Caroline Partner Budget API",
    description="Real-time lightweight partner budgeting backend",
    version="1.0.0"
)

# --- Non-blocking auto-update check ---
# Fires a background thread on startup — never blocks the server.
# Replace "owner/repo" with your actual GitHub repository.
check_for_updates(
    current_version=app.version,
    github_repo="owner/repo",
    app_name="Caroline Partner Budget",
)

# Enable CORS for frontend clients (Expo app runs on local port or dynamic IPs)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import Header, HTTPException, status, Depends
import os

API_KEY = os.getenv("BACKEND_SECRET_TOKEN", "my-secure-api-key-123")

async def verify_api_key(x_secret_token: str = Header(None, alias="X-SECRET-TOKEN")):
    if not x_secret_token or x_secret_token != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Invalid or missing X-SECRET-TOKEN header"
        )

# Include API routers with API Key authentication
app.include_router(partner.router, dependencies=[Depends(verify_api_key)])
app.include_router(transactions.router, dependencies=[Depends(verify_api_key)])

@app.get("/")
async def root():
    return {
        "status": "online",
        "message": "Welcome to the Caroline Partner Budget API. Visit /docs for Swagger UI documentation."
    }

@app.get("/api/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
