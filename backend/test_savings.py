"""
test_savings.py — Unit tests for the savings goals API endpoints (mock mode).

Run with:
    python -m pytest backend/test_savings.py -v
"""

from __future__ import annotations

import os

# Force mock mode BEFORE any project modules are imported
os.environ["MOCK_MODE"] = "true"

# Clear any cached project modules so they are re-imported with MOCK_MODE set
import sys

PROJECT_PREFIXES = ("auth", "routers", "supabase_client", "config", "mock_db", "main")
for mod in list(sys.modules.keys()):
    if mod in PROJECT_PREFIXES or mod.startswith(PROJECT_PREFIXES):
        del sys.modules[mod]

import pytest
from fastapi.testclient import TestClient

# Now import the app (all project modules will be fresh with MOCK_MODE=true)
from main import app

client = TestClient(app)

# Common test headers
HEADERS = {
    "Authorization": "Bearer mock-jwt-token-partner-a",
    "X-SECRET-TOKEN": "my-secure-api-key-123",
}
UNLINKED_HEADERS = {
    "Authorization": "Bearer mock-jwt-token-unlinked",
    "X-SECRET-TOKEN": "my-secure-api-key-123",
}

# ---------------------------------------------------------------------------
# Fixtures to clean mock state between test classes
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_mock_db():
    """Reset the mock savings goals to their initial state after each test."""
    from mock_db import MOCK_SAVINGS_GOALS

    MOCK_SAVINGS_GOALS.clear()
    MOCK_SAVINGS_GOALS.update(
        {
            "group-shared-123": [
                {
                    "id": "savings-shared-001",
                    "group_id": "group-shared-123",
                    "name": "Summer Vacation",
                    "target_amount": 3000.00,
                    "saved_amount": 1200.00,
                    "auto_save_percentage": 10.00,
                    "sort_order": 0,
                },
                {
                    "id": "savings-shared-002",
                    "group_id": "group-shared-123",
                    "name": "Emergency Fund",
                    "target_amount": 5000.00,
                    "saved_amount": 800.00,
                    "auto_save_percentage": 5.00,
                    "sort_order": 1,
                },
            ],
            "group-unlinked-456": [
                {
                    "id": "savings-unlinked-001",
                    "group_id": "group-unlinked-456",
                    "name": "Buy Shelton's New Phone 📱",
                    "target_amount": 1000.00,
                    "saved_amount": 0.00,
                    "auto_save_percentage": 0.00,
                    "sort_order": 0,
                },
            ],
        }
    )
    yield


# ===================================================================
# 1.  GET /api/savings/goals — List goals
# ===================================================================


class TestListGoals:
    def test_list_goals_shared_group(self):
        """Should return the two goals for the shared group."""
        resp = client.get("/api/savings/goals", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        names = [g["name"] for g in data]
        assert "Summer Vacation" in names
        assert "Emergency Fund" in names

    def test_list_goals_unlinked_group(self):
        """Should return the single goal for the unlinked group."""
        resp = client.get("/api/savings/goals", headers=UNLINKED_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Buy Shelton's New Phone 📱"

    def test_list_goals_auto_creates_default(self):
        """An empty group auto-creates a default goal."""
        from mock_db import MOCK_SAVINGS_GOALS

        MOCK_SAVINGS_GOALS["group-unlinked-456"] = []

        resp = client.get("/api/savings/goals", headers=UNLINKED_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert "Phone" in data[0]["name"]
        assert data[0]["target_amount"] == 1000.00
        assert data[0]["saved_amount"] == 0.00

    def test_no_auth_returns_401(self):
        """Missing auth token should return 401."""
        resp = client.get(
            "/api/savings/goals",
            headers={"X-SECRET-TOKEN": "my-secure-api-key-123"},
        )
        assert resp.status_code == 401


# ===================================================================
# 2.  POST /api/savings/goals — Create goal
# ===================================================================


class TestCreateGoal:
    def test_create_goal_simple(self):
        resp = client.post(
            "/api/savings/goals",
            headers=HEADERS,
            json={"name": "New Car Fund", "target_amount": 15000.00},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "New Car Fund"
        assert data["target_amount"] == 15000.00
        assert data["saved_amount"] == 0.00
        assert data["sort_order"] == 0
        assert "id" in data
        assert data["group_id"] == "group-shared-123"

    def test_create_goal_with_auto_save(self):
        resp = client.post(
            "/api/savings/goals",
            headers=HEADERS,
            json={
                "name": "Auto Save Goal",
                "target_amount": 500.00,
                "auto_save_percentage": 15.0,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["auto_save_percentage"] == 15.0

    def test_create_goal_clamps_auto_save_over_100(self):
        resp = client.post(
            "/api/savings/goals",
            headers=HEADERS,
            json={
                "name": "Over Max",
                "target_amount": 100.00,
                "auto_save_percentage": 150.0,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["auto_save_percentage"] == 100.0

    def test_create_goal_clamps_auto_save_below_0(self):
        resp = client.post(
            "/api/savings/goals",
            headers=HEADERS,
            json={
                "name": "Negative",
                "target_amount": 100.00,
                "auto_save_percentage": -10.0,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["auto_save_percentage"] == 0.0

    def test_create_goal_empty_name_returns_400(self):
        resp = client.post(
            "/api/savings/goals",
            headers=HEADERS,
            json={"name": "  ", "target_amount": 100.00},
        )
        assert resp.status_code == 400
        assert "Goal name is required" in resp.json()["detail"]

    def test_create_goal_appears_in_list(self):
        """After creating a goal, it should show up in the list."""
        client.post(
            "/api/savings/goals",
            headers=HEADERS,
            json={"name": "Test Fund", "target_amount": 200.00},
        )
        resp = client.get("/api/savings/goals", headers=HEADERS)
        names = [g["name"] for g in resp.json()]
        assert "Test Fund" in names


# ===================================================================
# 3.  POST /api/savings/goals/{goal_id} — Update goal
# ===================================================================


class TestUpdateGoal:
    def test_update_goal_name(self):
        """Should update the goal name."""
        resp = client.post(
            "/api/savings/goals/savings-shared-001",
            headers=HEADERS,
            json={"name": "Luxury Vacation"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Luxury Vacation"

    def test_update_goal_target(self):
        resp = client.post(
            "/api/savings/goals/savings-shared-001",
            headers=HEADERS,
            json={"target_amount": 5000.00},
        )
        assert resp.status_code == 200
        assert resp.json()["target_amount"] == 5000.00

    def test_update_goal_auto_save_pct(self):
        resp = client.post(
            "/api/savings/goals/savings-shared-001",
            headers=HEADERS,
            json={"auto_save_percentage": 20.0},
        )
        assert resp.status_code == 200
        assert resp.json()["auto_save_percentage"] == 20.0

    def test_update_goal_not_found_returns_404(self):
        resp = client.post(
            "/api/savings/goals/nonexistent-id",
            headers=HEADERS,
            json={"name": "Ghost"},
        )
        assert resp.status_code == 404

    def test_update_goal_no_fields_returns_400(self):
        resp = client.post(
            "/api/savings/goals/savings-shared-001",
            headers=HEADERS,
            json={},
        )
        assert resp.status_code == 400

    def test_update_goal_does_not_affect_other_goals(self):
        client.post(
            "/api/savings/goals/savings-shared-001",
            headers=HEADERS,
            json={"name": "Updated"},
        )
        resp = client.get("/api/savings/goals", headers=HEADERS)
        data = resp.json()
        goal1 = next(g for g in data if g["id"] == "savings-shared-001")
        goal2 = next(g for g in data if g["id"] == "savings-shared-002")
        assert goal1["name"] == "Updated"
        assert goal2["name"] == "Emergency Fund"  # unchanged


# ===================================================================
# 4.  POST /api/savings/goals/{goal_id}/deposit
# ===================================================================


class TestDeposit:
    def test_deposit_increases_saved_amount(self):
        resp = client.post(
            "/api/savings/goals/savings-shared-001/deposit",
            headers=HEADERS,
            json={"amount": 500.00},
        )
        assert resp.status_code == 200
        assert resp.json()["saved_amount"] == 1700.00  # 1200 + 500

    def test_deposit_non_positive_returns_400(self):
        resp = client.post(
            "/api/savings/goals/savings-shared-001/deposit",
            headers=HEADERS,
            json={"amount": 0},
        )
        assert resp.status_code == 400
        assert "Amount must be positive" in resp.json()["detail"]

        resp = client.post(
            "/api/savings/goals/savings-shared-001/deposit",
            headers=HEADERS,
            json={"amount": -50},
        )
        assert resp.status_code == 400

    def test_deposit_nonexistent_goal_returns_404(self):
        resp = client.post(
            "/api/savings/goals/bad-id/deposit",
            headers=HEADERS,
            json={"amount": 100},
        )
        assert resp.status_code == 404

    def test_deposit_then_list_reflects_update(self):
        client.post(
            "/api/savings/goals/savings-shared-001/deposit",
            headers=HEADERS,
            json={"amount": 100.00},
        )
        resp = client.get("/api/savings/goals", headers=HEADERS)
        goal = next(g for g in resp.json() if g["id"] == "savings-shared-001")
        assert goal["saved_amount"] == 1300.00


# ===================================================================
# 5.  POST /api/savings/goals/{goal_id}/withdraw
# ===================================================================


class TestWithdraw:
    def test_withdraw_decreases_saved_amount(self):
        resp = client.post(
            "/api/savings/goals/savings-shared-001/withdraw",
            headers=HEADERS,
            json={"amount": 200.00},
        )
        assert resp.status_code == 200
        assert resp.json()["saved_amount"] == 1000.00  # 1200 - 200

    def test_withdraw_from_empty_goal_returns_400(self):
        """Goal with 0 saved should reject any withdrawal."""
        resp = client.post(
            "/api/savings/goals/savings-unlinked-001/withdraw",
            headers=UNLINKED_HEADERS,
            json={"amount": 0.01},
        )
        assert resp.status_code == 400
        assert "Insufficient" in resp.json()["detail"]

    def test_withdraw_more_than_saved_returns_400(self):
        resp = client.post(
            "/api/savings/goals/savings-shared-001/withdraw",
            headers=HEADERS,
            json={"amount": 9999.00},
        )
        assert resp.status_code == 400

    def test_withdraw_non_positive_returns_400(self):
        resp = client.post(
            "/api/savings/goals/savings-shared-001/withdraw",
            headers=HEADERS,
            json={"amount": -100},
        )
        assert resp.status_code == 400

    def test_withdraw_nonexistent_goal_returns_404(self):
        resp = client.post(
            "/api/savings/goals/bad-id/withdraw",
            headers=HEADERS,
            json={"amount": 50},
        )
        assert resp.status_code == 404

    def test_deposit_then_withdraw_round_trip(self):
        """Deposit 500 then withdraw 200 should result in saved_amount of 1500."""
        client.post(
            "/api/savings/goals/savings-shared-001/deposit",
            headers=HEADERS,
            json={"amount": 500.00},
        )
        client.post(
            "/api/savings/goals/savings-shared-001/withdraw",
            headers=HEADERS,
            json={"amount": 200.00},
        )
        resp = client.get("/api/savings/goals", headers=HEADERS)
        goal = next(g for g in resp.json() if g["id"] == "savings-shared-001")
        assert goal["saved_amount"] == 1500.00  # 1200 + 500 - 200


# ===================================================================
# 6.  POST /api/savings/goals/reorder
# ===================================================================


class TestReorder:
    def test_reorder_swaps_positions(self):
        """Reverse the order of the two goals."""
        resp = client.post(
            "/api/savings/goals/reorder",
            headers=HEADERS,
            json={"goal_ids": ["savings-shared-002", "savings-shared-001"]},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "reordered"
        goals = body["goals"]
        assert len(goals) == 2
        assert goals[0]["id"] == "savings-shared-002"
        assert goals[0]["sort_order"] == 0
        assert goals[1]["id"] == "savings-shared-001"
        assert goals[1]["sort_order"] == 1

    def test_reorder_persists_in_list(self):
        """After reorder, GET should return goals in the new order."""
        client.post(
            "/api/savings/goals/reorder",
            headers=HEADERS,
            json={"goal_ids": ["savings-shared-002", "savings-shared-001"]},
        )
        resp = client.get("/api/savings/goals", headers=HEADERS)
        data = resp.json()
        assert data[0]["id"] == "savings-shared-002"
        assert data[1]["id"] == "savings-shared-001"

    def test_reorder_unknown_ids_are_ignored(self):
        """Unknown IDs in the list should be skipped."""
        resp = client.post(
            "/api/savings/goals/reorder",
            headers=HEADERS,
            json={
                "goal_ids": [
                    "unknown-id",
                    "savings-shared-002",
                    "savings-shared-001",
                ]
            },
        )
        assert resp.status_code == 200
        goals = resp.json()["goals"]
        assert len(goals) == 2
        assert goals[0]["id"] == "savings-shared-002"

    def test_reorder_missing_id_appended_at_end(self):
        """If a goal ID is not in the list, it should be appended at the end."""
        resp = client.post(
            "/api/savings/goals/reorder",
            headers=HEADERS,
            json={"goal_ids": ["savings-shared-002"]},  # only one of the two
        )
        assert resp.status_code == 200
        goals = resp.json()["goals"]
        assert len(goals) == 2
        assert goals[0]["id"] == "savings-shared-002"
        assert goals[0]["sort_order"] == 0
        assert goals[1]["id"] == "savings-shared-001"
        assert goals[1]["sort_order"] == 1

    def test_reorder_empty_list_preserves_goals(self):
        """An empty list should leave goals with sequential sort_orders."""
        resp = client.post(
            "/api/savings/goals/reorder",
            headers=HEADERS,
            json={"goal_ids": []},
        )
        assert resp.status_code == 200
        goals = resp.json()["goals"]
        assert len(goals) == 2


# ===================================================================
# 7.  DELETE /api/savings/goals/{goal_id}
# ===================================================================


class TestDeleteGoal:
    def test_delete_goal_removes_from_list(self):
        resp = client.delete(
            "/api/savings/goals/savings-shared-001",
            headers=HEADERS,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"

        resp = client.get("/api/savings/goals", headers=HEADERS)
        ids = [g["id"] for g in resp.json()]
        assert "savings-shared-001" not in ids

    def test_delete_nonexistent_goal_returns_404(self):
        resp = client.delete(
            "/api/savings/goals/nonexistent-id",
            headers=HEADERS,
        )
        assert resp.status_code == 404

    def test_delete_leaves_other_goals_untouched(self):
        client.delete("/api/savings/goals/savings-shared-001", headers=HEADERS)
        resp = client.get("/api/savings/goals", headers=HEADERS)
        remaining = resp.json()
        assert len(remaining) == 1
        assert remaining[0]["id"] == "savings-shared-002"


# ===================================================================
# 8.  Edge cases and error handling
# ===================================================================


class TestEdgeCases:
    def test_chain_multiple_deposits_and_withdrawals(self):
        """Chain multiple deposits and withdrawals."""
        client.post(
            "/api/savings/goals/savings-shared-001/deposit",
            headers=HEADERS,
            json={"amount": 100},
        )
        client.post(
            "/api/savings/goals/savings-shared-001/deposit",
            headers=HEADERS,
            json={"amount": 50},
        )
        client.post(
            "/api/savings/goals/savings-shared-001/withdraw",
            headers=HEADERS,
            json={"amount": 30},
        )
        resp = client.get("/api/savings/goals", headers=HEADERS)
        goal = next(g for g in resp.json() if g["id"] == "savings-shared-001")
        assert goal["saved_amount"] == 1320.00  # 1200 + 100 + 50 - 30

    def test_create_goal_default_values(self):
        """Creating a goal with only a name should use defaults."""
        resp = client.post(
            "/api/savings/goals",
            headers=HEADERS,
            json={"name": "Minimum Goal"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["target_amount"] == 1000.00
        assert data["auto_save_percentage"] == 0.0
        assert data["saved_amount"] == 0.0

    def test_wrong_api_key_returns_403(self):
        resp = client.get(
            "/api/savings/goals",
            headers={
                "Authorization": "Bearer mock-jwt-token-partner-a",
                "X-SECRET-TOKEN": "wrong-key",
            },
        )
        assert resp.status_code == 403

    def test_missing_auth_header_returns_401(self):
        """Missing Bearer token should fail auth."""
        resp = client.get(
            "/api/savings/goals",
            headers={"X-SECRET-TOKEN": "my-secure-api-key-123"},
        )
        assert resp.status_code == 401
