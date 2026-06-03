import httpx
from backend.config import SUPABASE_URL, SUPABASE_KEY

class SupabaseResponse:
    def __init__(self, data, error=None):
        self.data = data
        self.error = error

class SupabaseAuthUser:
    def __init__(self, user_dict):
        self.id = user_dict.get("id")
        self.email = user_dict.get("email")

class SupabaseAuthResponse:
    def __init__(self, user_dict):
        self.user = SupabaseAuthUser(user_dict) if user_dict else None

class DirectSupabaseClient:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.key = key
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        }

    # Verify a user's JWT access token and return user details
    def get_user(self, access_token: str) -> SupabaseAuthResponse:
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {access_token}"
        }
        with httpx.Client() as client:
            response = client.get(f"{self.url}/auth/v1/user", headers=headers)
            if response.status_code != 200:
                raise Exception(f"Failed to authenticate user: {response.status_code} - {response.text}")
            user_data = response.json()
            return SupabaseAuthResponse(user_data)

    # Perform a table query
    def select(self, table: str, eq_col: str = None, eq_val: str = None, order_col: str = None, desc: bool = False) -> SupabaseResponse:
        url = f"{self.url}/rest/v1/{table}"
        params = {}
        
        if eq_col and eq_val:
            params[eq_col] = f"eq.{eq_val}"
            
        if order_col:
            direction = "desc" if desc else "asc"
            params["order"] = f"{order_col}.{direction}"
            
        with httpx.Client() as client:
            response = client.get(url, headers=self.headers, params=params)
            if response.status_code >= 400:
                return SupabaseResponse(data=None, error=response.text)
            return SupabaseResponse(data=response.json(), error=None)

    # Insert row(s) into a table
    def insert(self, table: str, row_data: dict) -> SupabaseResponse:
        url = f"{self.url}/rest/v1/{table}"
        headers = {**self.headers, "Prefer": "return=representation"}
        with httpx.Client() as client:
            response = client.post(url, headers=headers, json=row_data)
            if response.status_code >= 400:
                return SupabaseResponse(data=None, error=response.text)
            return SupabaseResponse(data=response.json(), error=None)

    # Update row(s) in a table
    def update(self, table: str, update_data: dict, eq_col: str, eq_val: str) -> SupabaseResponse:
        url = f"{self.url}/rest/v1/{table}"
        params = {eq_col: f"eq.{eq_val}"}
        headers = {**self.headers, "Prefer": "return=representation"}
        with httpx.Client() as client:
            response = client.patch(url, headers=headers, params=params, json=update_data)
            if response.status_code >= 400:
                return SupabaseResponse(data=None, error=response.text)
            return SupabaseResponse(data=response.json(), error=None)

def create_direct_client() -> DirectSupabaseClient:
    return DirectSupabaseClient(SUPABASE_URL, SUPABASE_KEY)
