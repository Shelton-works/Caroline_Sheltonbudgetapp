import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from project root (one directory up from backend/)
dotenv_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path)

# Supabase credentials — always set via environment variables in production.
# Falls back to .env file for local development.
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
