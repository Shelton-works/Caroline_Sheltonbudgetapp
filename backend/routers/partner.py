import random
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from auth import get_current_user, MOCK_MODE, supabase_admin
from mock_db import MOCK_PARTNER_CODES, MOCK_PROFILES, MOCK_BUDGET_GROUPS

router = APIRouter(prefix="/api/partner", tags=["partner"])

class LinkRequest(BaseModel):
    code: str

@router.post("/code")
async def generate_code(current_user: dict = Depends(get_current_user)):
    # Generate random 6 digit code
    code = f"{random.randint(100000, 999999)}"
    user_id = current_user["user_id"]
    group_id = current_user["group_id"]

    if MOCK_MODE:
        MOCK_PARTNER_CODES[code] = {
            "code": code,
            "creator_id": user_id,
            "group_id": group_id,
            "is_used": False
        }
        return {"code": code}

    try:
        # Insert code into Supabase
        res = supabase_admin.insert("partner_codes", {
            "code": code,
            "creator_id": user_id,
            "group_id": group_id,
            "is_used": False
        })
        
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to generate code in DB")
            
        return {"code": code}
    except Exception as e:
        # Fallback to mock in case of failure
        MOCK_PARTNER_CODES[code] = {
            "code": code,
            "creator_id": user_id,
            "group_id": group_id,
            "is_used": False
        }
        return {"code": code}

@router.post("/link")
async def link_partner(req: LinkRequest, current_user: dict = Depends(get_current_user)):
    code = req.code.strip()
    user_id = current_user["user_id"]
    current_group_id = current_user["group_id"]

    if MOCK_MODE:
        if code not in MOCK_PARTNER_CODES:
            raise HTTPException(status_code=404, detail="Link code not found")
        
        link_data = MOCK_PARTNER_CODES[code]
        if link_data["is_used"]:
            raise HTTPException(status_code=400, detail="Link code already used")
            
        if link_data["creator_id"] == user_id:
            raise HTTPException(status_code=400, detail="You cannot link with yourself")

        target_group_id = link_data["group_id"]
        
        # Link user B's profile to user A's group_id
        if user_id in MOCK_PROFILES:
            MOCK_PROFILES[user_id]["group_id"] = target_group_id
        current_user["group_id"] = target_group_id
        current_user["profile"]["group_id"] = target_group_id
        
        # Mark code as used
        MOCK_PARTNER_CODES[code]["is_used"] = True

        # Rename group to indicate shared
        if target_group_id in MOCK_BUDGET_GROUPS:
            creator_name = MOCK_PROFILES.get(link_data["creator_id"], {}).get("display_name", "Partner")
            my_name = current_user["profile"].get("display_name", "User")
            MOCK_BUDGET_GROUPS[target_group_id]["name"] = f"{creator_name} & {my_name}'s Budget"

        return {"status": "success", "group_id": target_group_id}

    try:
        # Query the code in Supabase
        res = supabase_admin.select("partner_codes", eq_col="code", eq_val=code)
        if not res.data:
            raise HTTPException(status_code=404, detail="Link code not found")
            
        link_data = res.data[0]
        if link_data["is_used"]:
            raise HTTPException(status_code=400, detail="Link code already used")
            
        if link_data["creator_id"] == user_id:
            raise HTTPException(status_code=400, detail="You cannot link with yourself")

        target_group_id = link_data["group_id"]

        # 1. Update current user's profile to point to new group_id
        supabase_admin.update("profiles", {"group_id": target_group_id}, "id", user_id)
        
        # 2. Mark code as used
        supabase_admin.update("partner_codes", {"is_used": True}, "code", code)

        # 3. Clean up the unused/orphaned budget group of the joining user (optional)
        if current_group_id and current_group_id != target_group_id:
            # We can delete it or leave it. RLS handles safety.
            pass

        return {"status": "success", "group_id": target_group_id}
    except Exception as e:
        # Fallback for testing/mock
        if code in MOCK_PARTNER_CODES:
            link_data = MOCK_PARTNER_CODES[code]
            target_group_id = link_data["group_id"]
            MOCK_PARTNER_CODES[code]["is_used"] = True
            if user_id in MOCK_PROFILES:
                MOCK_PROFILES[user_id]["group_id"] = target_group_id
            return {"status": "success", "group_id": target_group_id}
            
        raise HTTPException(status_code=400, detail=f"Linking failed: {str(e)}")


@router.post("/disconnect")
async def disconnect_partner(current_user: dict = Depends(get_current_user)):
    import datetime
    user_id = current_user["user_id"]
    current_group_id = current_user["group_id"]

    if MOCK_MODE:
        profiles_in_group = [p for p in MOCK_PROFILES.values() if p["group_id"] == current_group_id]
        if len(profiles_in_group) <= 1:
            raise HTTPException(status_code=400, detail="You are not connected to any partner")

        # Create a new budget group for the disconnecting user
        new_group_id = f"group-unlinked-{random.randint(100000, 999999)}"
        MOCK_BUDGET_GROUPS[new_group_id] = {
            "id": new_group_id,
            "name": f"{current_user['profile'].get('display_name', 'User')}'s Budget",
            "fluid_balance": 0.00,
            "monthly_limit": 2000.00,
            "created_at": datetime.datetime.now().isoformat()
        }

        # Update the user's profile to point to the new group
        if user_id in MOCK_PROFILES:
            MOCK_PROFILES[user_id]["group_id"] = new_group_id
        current_user["group_id"] = new_group_id
        current_user["profile"]["group_id"] = new_group_id

        # Rename the other partner's budget group back to a single name
        other_profiles = [p for p in profiles_in_group if p["id"] != user_id]
        if other_profiles and current_group_id in MOCK_BUDGET_GROUPS:
            other_name = other_profiles[0].get("display_name", "Partner")
            MOCK_BUDGET_GROUPS[current_group_id]["name"] = f"{other_name}'s Budget"

        return {"status": "success", "group_id": new_group_id}

    try:
        # Check if they are actually in a shared group
        profiles_res = supabase_admin.select("profiles", eq_col="group_id", eq_val=current_group_id)
        if not profiles_res.data or len(profiles_res.data) <= 1:
            raise HTTPException(status_code=400, detail="You are not connected to any partner")

        # Create a new budget group in Supabase
        group_res = supabase_admin.insert(
            "budget_groups", {"name": "My Budget", "fluid_balance": 0.0, "monthly_limit": 2000.0}
        )
        if not group_res.data:
            raise HTTPException(status_code=500, detail="Failed to create a new budget group")
        new_group_id = group_res.data[0]["id"]

        # Update user's profile to point to the new group_id
        update_res = supabase_admin.update("profiles", {"group_id": new_group_id}, "id", user_id)
        if not update_res.data:
            raise HTTPException(status_code=500, detail="Failed to update profile to new budget group")

        return {"status": "success", "group_id": new_group_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Disconnecting failed: {str(e)}")

