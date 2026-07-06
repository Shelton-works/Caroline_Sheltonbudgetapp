import datetime
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, List, Optional
from auth import get_current_user, MOCK_MODE, supabase_admin
from mock_db import MOCK_SAVINGS_GOALS, MOCK_SAVINGS_CONTRIBUTIONS, MOCK_PROFILES, MOCK_BUDGET_GROUPS

router = APIRouter(prefix="/api/savings", tags=["savings"])


class SavingsGoalCreate(BaseModel):
    name: str
    target_amount: float = 1000.00
    auto_save_percentage: float = 0.00


class SavingsGoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    auto_save_percentage: Optional[float] = None


class SavingsDepositWithdraw(BaseModel):
    amount: float


class ReorderGoalsRequest(BaseModel):
    goal_ids: List[str]


# ---------------------------------------------------------------------------
# Push notification helper
# ---------------------------------------------------------------------------


async def send_savings_push_notification(partner_token: str, sender_name: str, amount: float, goal_name: str):
    """Send a push notification to a partner when someone deposits into a savings goal."""
    if not partner_token or not partner_token.startswith("ExponentPushToken"):
        return

    currency_symbol = "$"
    body_text = f"{sender_name} deposited {currency_symbol}{amount:.2f} into '{goal_name}'"

    payload = {
        "to": partner_token,
        "sound": "default",
        "title": "Shared Savings Update",
        "body": body_text,
        "data": {"type": "savings_deposit"}
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post("https://exp.host/--/api/v2/push/send", json=payload)
            print(f"Expo savings notification response: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Failed to dispatch Expo savings push notification: {e}")


# ---------------------------------------------------------------------------
# Contribution helpers
# ---------------------------------------------------------------------------


def get_contributions_for_goal(goal_id: str) -> Dict[str, float]:
    """Return {profile_id: total_contributed} for a goal."""
    if MOCK_MODE:
        return MOCK_SAVINGS_CONTRIBUTIONS.get(goal_id, {}).copy()
    try:
        res = supabase_admin.select(
            "savings_contributions",
            eq_col="goal_id",
            eq_val=goal_id,
        )
        if res.data:
            return {row["profile_id"]: float(row["amount"]) for row in res.data}
        return {}
    except Exception:
        return {}


def add_contribution(goal_id: str, profile_id: str, amount: float) -> None:
    """Add a contribution record for a profile to a goal."""
    if MOCK_MODE:
        if goal_id not in MOCK_SAVINGS_CONTRIBUTIONS:
            MOCK_SAVINGS_CONTRIBUTIONS[goal_id] = {}
        current = MOCK_SAVINGS_CONTRIBUTIONS[goal_id].get(profile_id, 0.0)
        MOCK_SAVINGS_CONTRIBUTIONS[goal_id][profile_id] = current + amount
        return
    try:
        existing = supabase_admin.select(
            "savings_contributions",
            eq_col="goal_id",
            eq_val=goal_id,
        )
        row = None
        if existing.data:
            for r in existing.data:
                if r.get("profile_id") == profile_id:
                    row = r
                    break
        if row:
            new_amount = float(row["amount"]) + amount
            supabase_admin.update(
                "savings_contributions",
                {"amount": new_amount, "updated_at": datetime.datetime.now().isoformat()},
                "id",
                row["id"],
            )
        else:
            supabase_admin.insert(
                "savings_contributions",
                {
                    "goal_id": goal_id,
                    "profile_id": profile_id,
                    "amount": amount,
                    "created_at": datetime.datetime.now().isoformat(),
                    "updated_at": datetime.datetime.now().isoformat(),
                },
            )
    except Exception as e:
        print(f"Error tracking contribution: {e}")


def subtract_contribution(goal_id: str, profile_id: str, amount: float) -> None:
    """Subtract a withdrawal from a profile's contribution to a goal."""
    if MOCK_MODE:
        if goal_id in MOCK_SAVINGS_CONTRIBUTIONS:
            current = MOCK_SAVINGS_CONTRIBUTIONS[goal_id].get(profile_id, 0.0)
            MOCK_SAVINGS_CONTRIBUTIONS[goal_id][profile_id] = max(0.0, current - amount)
        return
    try:
        existing = supabase_admin.select(
            "savings_contributions",
            eq_col="goal_id",
            eq_val=goal_id,
        )
        if existing.data:
            for r in existing.data:
                if r.get("profile_id") == profile_id:
                    new_amount = max(0.0, float(r["amount"]) - amount)
                    supabase_admin.update(
                        "savings_contributions",
                        {"amount": new_amount, "updated_at": datetime.datetime.now().isoformat()},
                        "id",
                        r["id"],
                    )
                    break
    except Exception as e:
        print(f"Error updating contribution on withdraw: {e}")


def enrich_goal_with_contributions(goal: dict) -> dict:
    """Add contributions field to a goal dict."""
    goal = {**goal}
    goal["contributions"] = get_contributions_for_goal(goal["id"])
    return goal


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------

def get_mock_goals(group_id: str) -> list:
    """Return a mutable list of mock goals for a group, creating defaults if empty."""
    if group_id not in MOCK_SAVINGS_GOALS or not MOCK_SAVINGS_GOALS[group_id]:
        MOCK_SAVINGS_GOALS[group_id] = [
            {
                "id": f"savings-{uuid.uuid4().hex[:8]}",
                "group_id": group_id,
                "name": "Buy Shelton's New Phone 📱",
                "target_amount": 1000.00,
                "saved_amount": 0.00,
                "auto_save_percentage": 0.00,
                "sort_order": 0,
            }
        ]
    return MOCK_SAVINGS_GOALS[group_id]


def find_mock_goal(group_id: str, goal_id: str) -> Optional[dict]:
    goals = get_mock_goals(group_id)
    for g in goals:
        if g["id"] == goal_id:
            return g
    return None


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def get_db_goals(group_id: str) -> list:
    """Return savings goals for a group from Supabase, or an empty list on failure."""
    try:
        res = supabase_admin.select("savings_goals", eq_col="group_id", eq_val=group_id)
        return res.data if res.data else []
    except Exception as e:
        print(f"Error fetching savings goals: {e}")
        return []


def upsert_db_goal(goal_data: dict) -> Optional[dict]:
    """Insert or update a savings goal in Supabase. Returns the saved record or None."""
    try:
        goal_id = goal_data.get("id")
        if goal_id:
            supabase_admin.update(
                "savings_goals",
                {k: v for k, v in goal_data.items() if k != "id"},
                "id",
                goal_id,
            )
            res = supabase_admin.select("savings_goals", eq_col="id", eq_val=goal_id)
            return res.data[0] if res.data else None
        else:
            goal_data["created_at"] = datetime.datetime.now().isoformat()
            goal_data["updated_at"] = datetime.datetime.now().isoformat()
            res = supabase_admin.insert("savings_goals", goal_data)
            return res.data[0] if res.data else goal_data
    except Exception as e:
        print(f"Error upserting savings goal: {e}")
        return None


def delete_db_goal(goal_id: str) -> bool:
    try:
        supabase_admin.delete("savings_goals", "id", goal_id)
        return True
    except Exception as e:
        print(f"Error deleting savings goal: {e}")
        return False


# ---------------------------------------------------------------------------
# Helper: ensure a default goal exists
# ---------------------------------------------------------------------------

def ensure_default_goal(group_id: str) -> Optional[dict]:
    """If the group has no goals, create a default one. Returns the new goal or None."""
    if MOCK_MODE:
        goals = get_mock_goals(group_id)
        return goals[0] if goals else None

    db_goals = get_db_goals(group_id)
    if db_goals:
        return db_goals[0]

    default = {
        "group_id": group_id,
        "name": "Buy Shelton's New Phone 📱",
        "target_amount": 1000.00,
        "saved_amount": 0.00,
        "auto_save_percentage": 0.00,
    }
    result = upsert_db_goal(default)
    return result or default


# ---------------------------------------------------------------------------
# Endpoints — NOTE: route order matters! Static paths must come before
# parameterized paths (e.g., /goals/reorder before /goals/{goal_id})
# ---------------------------------------------------------------------------

@router.get("/goals")
async def list_savings_goals(current_user: dict = Depends(get_current_user)):
    """List all savings goals for the user's group, with per-partner contributions."""
    group_id = current_user["group_id"]
    if not group_id:
        raise HTTPException(status_code=400, detail="User is not associated with any budget group")

    if MOCK_MODE:
        goals = get_mock_goals(group_id)
        return [enrich_goal_with_contributions(g) for g in goals]

    goals = get_db_goals(group_id)
    if not goals:
        default = ensure_default_goal(group_id)
        goals = [default] if default else []
    return [enrich_goal_with_contributions(g) for g in goals]


@router.get("/goals/{goal_id}/contributions")
async def get_goal_contributions(
    goal_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get per-profile contribution breakdown for a specific goal."""
    group_id = current_user["group_id"]
    if not group_id:
        raise HTTPException(status_code=400, detail="User is not associated with any budget group")

    # Verify goal exists and belongs to user's group
    if MOCK_MODE:
        goal = find_mock_goal(group_id, goal_id)
        if not goal:
            raise HTTPException(status_code=404, detail="Savings goal not found")
    else:
        goals = get_db_goals(group_id)
        if not any(g["id"] == goal_id for g in goals):
            raise HTTPException(status_code=404, detail="Savings goal not found")

    contribs = get_contributions_for_goal(goal_id)
    # Enrich with profile display names
    enriched = []
    for pid, amount in contribs.items():
        display_name = "Unknown"
        if MOCK_MODE and pid in MOCK_PROFILES:
            display_name = MOCK_PROFILES[pid]["display_name"]
        enriched.append({
            "profile_id": pid,
            "display_name": display_name,
            "amount": amount,
        })
    return enriched


@router.post("/goals")
async def create_savings_goal(
    goal: SavingsGoalCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new savings goal for the user's group."""
    group_id = current_user["group_id"]
    if not group_id:
        raise HTTPException(status_code=400, detail="User is not associated with any budget group")
    if not goal.name.strip():
        raise HTTPException(status_code=400, detail="Goal name is required")

    goal_data = {
        "id": str(uuid.uuid4()),
        "group_id": group_id,
        "name": goal.name.strip(),
        "target_amount": goal.target_amount,
        "saved_amount": 0.00,
        "auto_save_percentage": max(0.0, min(100.0, goal.auto_save_percentage)),
        "sort_order": 0,
    }

    if MOCK_MODE:
        goals = get_mock_goals(group_id)
        goals.append(goal_data)
        return enrich_goal_with_contributions(goal_data)

    result = upsert_db_goal(goal_data)
    if result:
        return enrich_goal_with_contributions(result)
    goals = get_mock_goals(group_id)
    goals.append(goal_data)
    return enrich_goal_with_contributions(goal_data)


@router.post("/goals/reorder")
async def reorder_savings_goals(
    req: ReorderGoalsRequest,
    current_user: dict = Depends(get_current_user),
):
    """Reorder savings goals by providing an ordered list of goal IDs."""
    group_id = current_user["group_id"]
    if not group_id:
        raise HTTPException(status_code=400, detail="User is not associated with any budget group")

    if MOCK_MODE:
        goals = get_mock_goals(group_id)
        id_to_goal = {g["id"]: g for g in goals}
        reordered = []
        seen = set()
        for idx, gid in enumerate(req.goal_ids):
            if gid in id_to_goal and gid not in seen:
                g = id_to_goal[gid]
                g["sort_order"] = idx
                reordered.append(g)
                seen.add(gid)
        next_order = len(req.goal_ids) if req.goal_ids else 0
        for g in goals:
            if g["id"] not in seen:
                g["sort_order"] = next_order
                next_order += 1
                reordered.append(g)
        MOCK_SAVINGS_GOALS[group_id] = reordered
        return {"status": "reordered", "goals": [enrich_goal_with_contributions(g) for g in reordered]}

    try:
        for idx, gid in enumerate(req.goal_ids):
            supabase_admin.update(
                "savings_goals",
                {"sort_order": idx, "updated_at": datetime.datetime.now().isoformat()},
                "id",
                gid,
            )
        updated = get_db_goals(group_id)
        updated.sort(key=lambda g: g.get("sort_order", 0))
        return {"status": "reordered", "goals": [enrich_goal_with_contributions(g) for g in updated]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reorder goals: {str(e)}")


@router.post("/goals/{goal_id}")
async def update_savings_goal(
    goal_id: str,
    update: SavingsGoalUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update a specific savings goal's name, target, or auto-save percentage."""
    group_id = current_user["group_id"]
    if not group_id:
        raise HTTPException(status_code=400, detail="User is not associated with any budget group")

    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_data.pop("sort_order", None)

    if "auto_save_percentage" in update_data:
        update_data["auto_save_percentage"] = max(0.0, min(100.0, update_data["auto_save_percentage"]))

    if MOCK_MODE:
        goal = find_mock_goal(group_id, goal_id)
        if not goal:
            raise HTTPException(status_code=404, detail="Savings goal not found")
        goal.update(update_data)
        return enrich_goal_with_contributions(goal)

    try:
        goal = get_db_goals(group_id)
        existing = next((g for g in goal if g["id"] == goal_id), None)
        if not existing:
            raise HTTPException(status_code=404, detail="Savings goal not found")
        update_data["updated_at"] = datetime.datetime.now().isoformat()
        supabase_admin.update("savings_goals", update_data, "id", goal_id)
        res = supabase_admin.select("savings_goals", eq_col="id", eq_val=goal_id)
        goal = res.data[0] if res.data else {**existing, **update_data}
        return enrich_goal_with_contributions(goal)
    except HTTPException:
        raise
    except Exception as e:
        goal = find_mock_goal(group_id, goal_id)
        if goal:
            goal.update(update_data)
            return enrich_goal_with_contributions(goal)
        raise HTTPException(status_code=500, detail=f"Failed to update goal: {str(e)}")


@router.post("/goals/{goal_id}/deposit")
async def deposit_to_savings(
    goal_id: str,
    req: SavingsDepositWithdraw,
    current_user: dict = Depends(get_current_user),
):
    """Deposit money to a specific savings goal (tracks per-profile contribution)."""
    group_id = current_user["group_id"]
    profile_id = current_user.get("user_id") or current_user["profile"].get("id", "")
    if not group_id:
        raise HTTPException(status_code=400, detail="User is not associated with any budget group")
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    sender_name = current_user["profile"].get("display_name", "Your partner")

    # Resolve goal name for the notification
    goal_name = "savings goal"

    if MOCK_MODE:
        goal = find_mock_goal(group_id, goal_id)
        if not goal:
            raise HTTPException(status_code=404, detail="Savings goal not found")
        goal_name = goal.get("name", "savings goal")
        goal["saved_amount"] = float(goal["saved_amount"]) + req.amount
        add_contribution(goal_id, profile_id, req.amount)

        # Dispatch notification to partner
        partners = [p for p in MOCK_PROFILES.values() if p["group_id"] == group_id and p["id"] != profile_id]
        for partner in partners:
            if partner.get("expo_push_token"):
                await send_savings_push_notification(
                    partner["expo_push_token"],
                    sender_name,
                    req.amount,
                    goal_name,
                )

        return enrich_goal_with_contributions(goal)

    try:
        goals = get_db_goals(group_id)
        existing = next((g for g in goals if g["id"] == goal_id), None)
        if not existing:
            raise HTTPException(status_code=404, detail="Savings goal not found")
        goal_name = existing.get("name", "savings goal")
        current_saved = float(existing.get("saved_amount") or 0)
        new_saved = current_saved + req.amount
        supabase_admin.update(
            "savings_goals",
            {"saved_amount": new_saved, "updated_at": datetime.datetime.now().isoformat()},
            "id",
            goal_id,
        )
        add_contribution(goal_id, profile_id, req.amount)

        # Dispatch notification to partner
        profiles_res = supabase_admin.select("profiles", eq_col="group_id", eq_val=group_id)
        if profiles_res.data:
            for p in profiles_res.data:
                if p.get("id") != profile_id:
                    token = p.get("expo_push_token")
                    if token:
                        await send_savings_push_notification(
                            token,
                            sender_name,
                            req.amount,
                            goal_name,
                        )

        res = supabase_admin.select("savings_goals", eq_col="id", eq_val=goal_id)
        goal = res.data[0] if res.data else {**existing, "saved_amount": new_saved}
        return enrich_goal_with_contributions(goal)
    except HTTPException:
        raise
    except Exception as e:
        goal = find_mock_goal(group_id, goal_id)
        if goal:
            goal_name = goal.get("name", "savings goal")
            goal["saved_amount"] = float(goal["saved_amount"]) + req.amount
            add_contribution(goal_id, profile_id, req.amount)

            # Dispatch notification to partner (mock fallback)
            partners = [p for p in MOCK_PROFILES.values() if p["group_id"] == group_id and p["id"] != profile_id]
            for partner in partners:
                if partner.get("expo_push_token"):
                    await send_savings_push_notification(
                        partner["expo_push_token"],
                        sender_name,
                        req.amount,
                        goal_name,
                    )

            return enrich_goal_with_contributions(goal)
        raise HTTPException(status_code=500, detail=f"Failed to deposit: {str(e)}")


@router.post("/goals/{goal_id}/withdraw")
async def withdraw_from_savings(
    goal_id: str,
    req: SavingsDepositWithdraw,
    current_user: dict = Depends(get_current_user),
):
    """Withdraw money from a specific savings goal (tracks per-profile contribution)."""
    group_id = current_user["group_id"]
    profile_id = current_user.get("user_id") or current_user["profile"].get("id", "")
    if not group_id:
        raise HTTPException(status_code=400, detail="User is not associated with any budget group")
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    if MOCK_MODE:
        goal = find_mock_goal(group_id, goal_id)
        if not goal:
            raise HTTPException(status_code=404, detail="Savings goal not found")
        current_saved = float(goal["saved_amount"])
        if req.amount > current_saved:
            raise HTTPException(status_code=400, detail="Insufficient savings")
        goal["saved_amount"] = current_saved - req.amount
        subtract_contribution(goal_id, profile_id, req.amount)
        return enrich_goal_with_contributions(goal)

    try:
        goals = get_db_goals(group_id)
        existing = next((g for g in goals if g["id"] == goal_id), None)
        if not existing:
            raise HTTPException(status_code=404, detail="Savings goal not found")
        current_saved = float(existing.get("saved_amount") or 0)
        if req.amount > current_saved:
            raise HTTPException(status_code=400, detail="Insufficient savings")
        new_saved = current_saved - req.amount
        supabase_admin.update(
            "savings_goals",
            {"saved_amount": new_saved, "updated_at": datetime.datetime.now().isoformat()},
            "id",
            goal_id,
        )
        subtract_contribution(goal_id, profile_id, req.amount)
        res = supabase_admin.select("savings_goals", eq_col="id", eq_val=goal_id)
        goal = res.data[0] if res.data else {**existing, "saved_amount": new_saved}
        return enrich_goal_with_contributions(goal)
    except HTTPException:
        raise
    except Exception as e:
        goal = find_mock_goal(group_id, goal_id)
        if goal:
            current_saved = float(goal["saved_amount"])
            if req.amount > current_saved:
                raise HTTPException(status_code=400, detail="Insufficient savings")
            goal["saved_amount"] = current_saved - req.amount
            subtract_contribution(goal_id, profile_id, req.amount)
            return enrich_goal_with_contributions(goal)
        raise HTTPException(status_code=500, detail=f"Failed to withdraw: {str(e)}")


@router.delete("/goals/{goal_id}")
async def delete_savings_goal(
    goal_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a savings goal."""
    group_id = current_user["group_id"]
    if not group_id:
        raise HTTPException(status_code=400, detail="User is not associated with any budget group")

    if MOCK_MODE:
        goals = get_mock_goals(group_id)
        idx = next((i for i, g in enumerate(goals) if g["id"] == goal_id), -1)
        if idx == -1:
            raise HTTPException(status_code=404, detail="Savings goal not found")
        removed = goals.pop(idx)
        MOCK_SAVINGS_CONTRIBUTIONS.pop(goal_id, None)
        return {"status": "deleted", "goal_id": removed["id"]}

    try:
        deleted = delete_db_goal(goal_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Savings goal not found")
        return {"status": "deleted", "goal_id": goal_id}
    except HTTPException:
        raise
    except Exception as e:
        goals = get_mock_goals(group_id)
        idx = next((i for i, g in enumerate(goals) if g["id"] == goal_id), -1)
        if idx != -1:
            goals.pop(idx)
        return {"status": "deleted", "goal_id": goal_id}
