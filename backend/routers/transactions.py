import datetime
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from auth import get_current_user, MOCK_MODE, supabase_admin
from mock_db import MOCK_TRANSACTIONS, MOCK_BUDGET_GROUPS, MOCK_PROFILES

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

class TransactionCreate(BaseModel):
    amount: float
    type: str # 'expense' or 'income'
    category: str
    memo: str

class BudgetUpdate(BaseModel):
    monthly_limit: Optional[float] = None
    fluid_balance: Optional[float] = None

# Helper function to send push notifications via Expo API
async def send_partner_push_notification(partner_token: str, sender_name: str, amount: float, memo: str, tx_type: str):
    if not partner_token or not partner_token.startswith("ExponentPushToken"):
        return
        
    action_word = "added" if tx_type == "expense" else "injected"
    currency_symbol = "$"
    body_text = f"{sender_name} {action_word} {currency_symbol}{amount:.2f}: '{memo}'"
    
    payload = {
        "to": partner_token,
        "sound": "default",
        "title": "Shared Budget Update",
        "body": body_text,
        "data": {"type": "transaction"}
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post("https://exp.host/--/api/v2/push/send", json=payload)
            print(f"Expo notification response: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Failed to dispatch Expo push notification: {e}")

@router.get("/budget")
async def get_budget(current_user: dict = Depends(get_current_user)):
    group_id = current_user["group_id"]
    if not group_id:
        raise HTTPException(status_code=400, detail="User is not associated with any budget group")

    if MOCK_MODE:
        if group_id not in MOCK_BUDGET_GROUPS:
            # Create group dynamically
            MOCK_BUDGET_GROUPS[group_id] = {
                "id": group_id,
                "name": "My Budget",
                "fluid_balance": 0.00,
                "monthly_limit": 2000.00,
                "created_at": datetime.datetime.now().isoformat()
            }
        budget = dict(MOCK_BUDGET_GROUPS[group_id])
        # Count profiles sharing this group
        budget["profiles_count"] = sum(
            1 for p in MOCK_PROFILES.values() if p["group_id"] == group_id
        )
        return budget

    try:
        res = supabase_admin.select("budget_groups", eq_col="id", eq_val=group_id)
        if not res.data:
            raise HTTPException(status_code=404, detail="Budget group not found")
        budget = dict(res.data[0])
        # Count profiles sharing this group (for "isLinked" determination)
        profiles_res = supabase_admin.select("profiles", eq_col="group_id", eq_val=group_id)
        budget["profiles_count"] = len(profiles_res.data) if profiles_res.data else 1
        return budget
    except Exception as e:
        # Fallback to mock
        return MOCK_BUDGET_GROUPS.get(group_id, {
            "id": group_id,
            "name": "Fallback Budget",
            "fluid_balance": 150.00,
            "monthly_limit": 2000.00,
            "created_at": datetime.datetime.now().isoformat(),
            "profiles_count": 1
        })

@router.post("/budget/update")
async def update_budget(update_req: BudgetUpdate, current_user: dict = Depends(get_current_user)):
    group_id = current_user["group_id"]
    if not group_id:
        raise HTTPException(status_code=400, detail="User is not associated with any budget group")

    update_data = {k: v for k, v in update_req.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    if MOCK_MODE:
        if group_id not in MOCK_BUDGET_GROUPS:
            MOCK_BUDGET_GROUPS[group_id] = {
                "id": group_id,
                "name": "My Budget",
                "fluid_balance": 0.00,
                "monthly_limit": 2000.00,
                "created_at": datetime.datetime.now().isoformat()
            }
        MOCK_BUDGET_GROUPS[group_id].update(update_data)
        return MOCK_BUDGET_GROUPS[group_id]

    try:
        res = supabase_admin.update("budget_groups", update_data, "id", group_id)
        if not res.data:
            raise HTTPException(status_code=404, detail="Budget group not found")
        return res.data[0]
    except Exception as e:
        if group_id in MOCK_BUDGET_GROUPS:
            MOCK_BUDGET_GROUPS[group_id].update(update_data)
            return MOCK_BUDGET_GROUPS[group_id]
        raise HTTPException(status_code=400, detail=f"Failed to update budget: {str(e)}")

@router.get("/")
async def get_transactions(current_user: dict = Depends(get_current_user)):
    group_id = current_user["group_id"]
    if not group_id:
        return []

    if MOCK_MODE:
        # Filter transactions matching this group_id
        txs = [t for t in MOCK_TRANSACTIONS if t["group_id"] == group_id]
        # Sort descending by date
        txs.sort(key=lambda x: x["date"], reverse=True)
        return txs

    try:
        res = supabase_admin.select("transactions", eq_col="group_id", eq_val=group_id, order_col="date", desc=True)
        return res.data
    except Exception as e:
        # Fallback to mock
        txs = [t for t in MOCK_TRANSACTIONS if t["group_id"] == group_id]
        txs.sort(key=lambda x: x["date"], reverse=True)
        return txs

@router.post("/")
async def create_transaction(tx_in: TransactionCreate, current_user: dict = Depends(get_current_user)):
    group_id = current_user["group_id"]
    user_id = current_user["user_id"]
    sender_name = current_user["profile"].get("display_name", "Your partner")

    if not group_id:
        raise HTTPException(status_code=400, detail="User is not associated with any budget group")

    # Get current balance
    if MOCK_MODE:
        if group_id not in MOCK_BUDGET_GROUPS:
            MOCK_BUDGET_GROUPS[group_id] = {
                "id": group_id,
                "name": "My Budget",
                "fluid_balance": 0.00,
                "monthly_limit": 2000.00,
                "created_at": datetime.datetime.now().isoformat()
            }
        current_budget = MOCK_BUDGET_GROUPS[group_id]
    else:
        try:
            budget_res = supabase_admin.select("budget_groups", eq_col="id", eq_val=group_id)
            if not budget_res.data:
                raise HTTPException(status_code=404, detail="Budget group not found")
            current_budget = budget_res.data[0]
        except Exception as e:
            current_budget = MOCK_BUDGET_GROUPS.get(group_id, {"fluid_balance": 0.00})

    # Calculate new fluid balance
    current_balance = float(current_budget.get("fluid_balance") or 0.0)
    tx_amount = float(tx_in.amount or 0.0)
    if tx_in.type == "expense":
        new_balance = current_balance - tx_amount
    else: # income injection
        new_balance = current_balance + tx_amount

    new_tx = {
        "id": str(uuid.uuid4()),
        "group_id": group_id,
        "profile_id": user_id,
        "amount": tx_amount,
        "type": tx_in.type,
        "category": tx_in.category,
        "memo": tx_in.memo,
        "date": datetime.datetime.now().isoformat()
    }

    # Store transaction & update budget in MOCK or DB
    if MOCK_MODE:
        MOCK_TRANSACTIONS.append(new_tx)
        MOCK_BUDGET_GROUPS[group_id]["fluid_balance"] = new_balance
        
        # Dispatch notification to partner if mock exists
        # In mock, we can find partner in MOCK_PROFILES
        partners = [p for p in MOCK_PROFILES.values() if p["group_id"] == group_id and p["id"] != user_id]
        for partner in partners:
            if partner.get("expo_push_token"):
                await send_partner_push_notification(
                    partner["expo_push_token"],
                    sender_name,
                    tx_in.amount,
                    tx_in.memo,
                    tx_in.type
                )
                
        return {"transaction": new_tx, "fluid_balance": new_balance}

    try:
        # 1. Update fluid balance in budget group
        supabase_admin.update("budget_groups", {"fluid_balance": new_balance}, "id", group_id)

        # 2. Insert transaction
        tx_res = supabase_admin.insert("transactions", new_tx)

        # 3. Retrieve partner's expo push token and send notification
        profiles_res = supabase_admin.select("profiles", eq_col="group_id", eq_val=group_id)
        if profiles_res.data:
            for p in profiles_res.data:
                if p.get("id") != user_id:
                    token = p.get("expo_push_token")
                    if token:
                        await send_partner_push_notification(
                            token,
                            sender_name,
                            tx_in.amount,
                            tx_in.memo,
                            tx_in.type
                        )

        return {"transaction": tx_res.data[0], "fluid_balance": new_balance}
    except Exception as e:
        # Fail-safe to mock
        MOCK_TRANSACTIONS.append(new_tx)
        if group_id in MOCK_BUDGET_GROUPS:
            MOCK_BUDGET_GROUPS[group_id]["fluid_balance"] = new_balance
        return {"transaction": new_tx, "fluid_balance": new_balance}

@router.post("/register-push-token")
async def register_push_token(token_data: dict, current_user: dict = Depends(get_current_user)):
    token = token_data.get("token")
    user_id = current_user["user_id"]
    if not token:
        raise HTTPException(status_code=400, detail="Token is required")

    if MOCK_MODE:
        if user_id in MOCK_PROFILES:
            MOCK_PROFILES[user_id]["expo_push_token"] = token
        current_user["profile"]["expo_push_token"] = token
        return {"status": "success"}

    try:
        supabase_admin.update("profiles", {"expo_push_token": token}, "id", user_id)
        return {"status": "success"}
    except Exception as e:
        if user_id in MOCK_PROFILES:
            MOCK_PROFILES[user_id]["expo_push_token"] = token
        return {"status": "success"}
