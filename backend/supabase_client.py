import httpx
from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY


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
    def __init__(self, url: str, service_role_key: str):
        self.url = url.rstrip("/")
        self.service_role_key = service_role_key
        self.headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }
        # Reuse a single HTTP client across all requests for connection pooling
        self._client = httpx.Client()

    # Verify a user's JWT access token and return user details
    def get_user(self, access_token: str) -> SupabaseAuthResponse:
        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {access_token}",
        }
        response = self._client.get(f"{self.url}/auth/v1/user", headers=headers)
        if response.status_code != 200:
            raise Exception(
                f"Failed to authenticate user: {response.status_code} - {response.text}"
            )
        user_data = response.json()
        return SupabaseAuthResponse(user_data)

    # Perform a table query
    def select(
        self,
        table: str,
        eq_col: str = None,
        eq_val: str = None,
        order_col: str = None,
        desc: bool = False,
    ) -> SupabaseResponse:
        url = f"{self.url}/rest/v1/{table}"
        params = {}

        if eq_col and eq_val:
            params[eq_col] = f"eq.{eq_val}"

        if order_col:
            direction = "desc" if desc else "asc"
            params["order"] = f"{order_col}.{direction}"

        response = self._client.get(url, headers=self.headers, params=params)
        if response.status_code >= 400:
            return SupabaseResponse(data=None, error=response.text)
        return SupabaseResponse(data=response.json(), error=None)

    # Insert row(s) into a table
    def insert(self, table: str, row_data: dict) -> SupabaseResponse:
        url = f"{self.url}/rest/v1/{table}"
        headers = {**self.headers, "Prefer": "return=representation"}
        response = self._client.post(url, headers=headers, json=row_data)
        if response.status_code >= 400:
            return SupabaseResponse(data=None, error=response.text)
        return SupabaseResponse(data=response.json(), error=None)

    # Update row(s) in a table
    def update(
        self, table: str, update_data: dict, eq_col: str, eq_val: str
    ) -> SupabaseResponse:
        url = f"{self.url}/rest/v1/{table}"
        params = {eq_col: f"eq.{eq_val}"}
        headers = {**self.headers, "Prefer": "return=representation"}
        response = self._client.patch(url, headers=headers, params=params, json=update_data)
        if response.status_code >= 400:
            return SupabaseResponse(data=None, error=response.text)
        return SupabaseResponse(data=response.json(), error=None)

    def close(self):
        """Close the underlying HTTP client, releasing any pooled connections."""
        self._client.close()


def create_direct_client() -> DirectSupabaseClient:
    return DirectSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
