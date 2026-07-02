import os
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase_client import create_direct_client
from config import SUPABASE_URL

# Whether to run in mock mode (for local development without Supabase)
# Set MOCK_MODE=true in env to enable; disabled by default in production
MOCK_MODE = os.getenv("MOCK_MODE", "false").lower() == "true"

supabase_admin = None
if not MOCK_MODE:
    try:
        supabase_admin = create_direct_client()
    except Exception as e:
        print(f"Failed to connect to Supabase: {e}. Falling back to MOCK_MODE.")
        MOCK_MODE = True

security = HTTPBearer()

# Mock users database in memory (only used when MOCK_MODE=True)
MOCK_USERS = {
    "mock-jwt-token-partner-a": {
        "user_id": "user-a-1111",
        "email": "alex@example.com",
        "profile": {
            "id": "user-a-1111",
            "email": "alex@example.com",
            "display_name": "Alex",
            "group_id": "group-shared-123",
            "expo_push_token": "ExponentPushToken[mock-partner-a]",
        },
        "group_id": "group-shared-123",
    },
    "mock-jwt-token-partner-b": {
        "user_id": "user-b-2222",
        "email": "taylor@example.com",
        "profile": {
            "id": "user-b-2222",
            "email": "taylor@example.com",
            "display_name": "Taylor",
            "group_id": "group-shared-123",
            "expo_push_token": "ExponentPushToken[mock-partner-b]",
        },
        "group_id": "group-shared-123",
    },
    "mock-jwt-token-unlinked": {
        "user_id": "user-c-3333",
        "email": "caroline@example.com",
        "profile": {
            "id": "user-c-3333",
            "email": "caroline@example.com",
            "display_name": "Caroline",
            "group_id": "group-unlinked-456",
            "expo_push_token": None,
        },
        "group_id": "group-unlinked-456",
    },
}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
):
    token = credentials.credentials

    if MOCK_MODE:
        if token in MOCK_USERS:
            return MOCK_USERS[token]
        # Map unknown tokens to Caroline for testing
        return {
            "user_id": "user-c-3333",
            "email": "caroline@example.com",
            "profile": {
                "id": "user-c-3333",
                "email": "caroline@example.com",
                "display_name": "Caroline",
                "group_id": "group-unlinked-456",
                "expo_push_token": None,
            },
            "group_id": "group-unlinked-456",
        }

    try:
        res = supabase_admin.get_user(token)
        if not res or not res.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

        user = res.user

        # Query user's public profile from PostgreSQL
        profile_res = supabase_admin.select("profiles", eq_col="id", eq_val=user.id)
        if not profile_res.data:
            # Create a default budget group
            group_res = supabase_admin.insert(
                "budget_groups", {"name": "My Budget", "fluid_balance": 0.0, "monthly_limit": 2000.0}
            )
            group_id = group_res.data[0]["id"] if group_res.data else None

            default_profile = {
                "id": user.id,
                "email": user.email,
                "display_name": user.email.split("@")[0] if user.email else "User",
                "group_id": group_id,
            }
            insert_res = supabase_admin.insert("profiles", default_profile)
            profile = insert_res.data[0] if insert_res.data else default_profile
        else:
            profile = profile_res.data[0]

        return {
            "user_id": user.id,
            "email": user.email,
            "profile": profile,
            "group_id": profile.get("group_id"),
        }
    except Exception as e:
        print(f"Auth error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed. Please sign in again.",
        )
