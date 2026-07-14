"""
Run this script to apply the savings tables migration to your production Supabase database.

Usage:
  python migrate_schema.py

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env or environment.
"""

import os
import sys
import webbrowser
from pathlib import Path

# Load .env from project root
dotenv_path = Path(__file__).resolve().parent.parent / ".env"
if dotenv_path.exists():
    from dotenv import load_dotenv
    load_dotenv(dotenv_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment / .env")
    sys.exit(1)

# Read migration SQL
sql_path = Path(__file__).parent / "migrations" / "002_savings_tables.sql"
if not sql_path.exists():
    print(f"ERROR: Migration file not found: {sql_path}")
    sys.exit(1)

sql = sql_path.read_text()

# Extract project ref from URL
# e.g. "https://xxxxx.supabase.co" -> "xxxxx"
project_ref = SUPABASE_URL.replace("https://", "").split(".")[0]

dashboard_url = f"https://supabase.com/dashboard/project/{project_ref}/sql/new"

print("=" * 60)
print("  Supabase Schema Migration: Savings Tables")
print("=" * 60)
print()
print(f"Project: {project_ref}")
print(f"Dashboard: {dashboard_url}")
print()
print("This migration adds the 'savings_goals' and 'savings_contributions'")
print("tables needed for the savings goals feature.")
print()
print("To apply:")
print(f"  1. Open the dashboard URL above (or click it)")
print(f"  2. The SQL is already copied below -- paste it into the SQL Editor")
print(f"  3. Click 'Run' to execute")
print()
print("--- SQL to paste ---")
print(sql)
print("--- end SQL ---")
print()

# Try to open the dashboard URL
try:
    webbrowser.open(dashboard_url)
    print("(Dashboard URL opened in your browser)")
except Exception:
    pass
