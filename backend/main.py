import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import partner, transactions

app = FastAPI(
    title="Caroline Partner Budget API",
    description="Real-time lightweight partner budgeting backend",
    version="1.0.0"
)

# Enable CORS for frontend clients (Expo app runs on local port or dynamic IPs)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(partner.router)
app.include_router(transactions.router)

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
