import datetime

# Mock Budget Groups
# Users start in individual groups, and merge upon linking
MOCK_BUDGET_GROUPS = {
    "group-shared-123": {
        "id": "group-shared-123",
        "name": "Alex & Taylor's Budget",
        "fluid_balance": 1812.00,
        "monthly_limit": 2550.00,
        "created_at": datetime.datetime.now().isoformat()
    },
    "group-unlinked-456": {
        "id": "group-unlinked-456",
        "name": "Caroline's Budget",
        "fluid_balance": 821.03,
        "monthly_limit": 2700.00,
        "created_at": datetime.datetime.now().isoformat()
    }
}

# Mock Profiles
MOCK_PROFILES = {
    "user-a-1111": {
        "id": "user-a-1111",
        "email": "alex@example.com",
        "display_name": "Alex",
        "group_id": "group-shared-123",
        "expo_push_token": "ExponentPushToken[mock-partner-a]"
    },
    "user-b-2222": {
        "id": "user-b-2222",
        "email": "taylor@example.com",
        "display_name": "Taylor",
        "group_id": "group-shared-123",
        "expo_push_token": "ExponentPushToken[mock-partner-b]"
    },
    "user-c-3333": {
        "id": "user-c-3333",
        "email": "caroline@example.com",
        "display_name": "Caroline",
        "group_id": "group-unlinked-456",
        "expo_push_token": None
    }
}

# Mock Partner codes
# Maps code -> {"creator_id": "...", "group_id": "...", "is_used": False}
MOCK_PARTNER_CODES = {
    "123456": {
        "code": "123456",
        "creator_id": "user-c-3333",
        "group_id": "group-unlinked-456",
        "is_used": False
    }
}

# Mock Savings Contributions — tracks per-profile contributions per goal
# Structure: {goal_id: {profile_id: total_contributed}}
MOCK_SAVINGS_CONTRIBUTIONS = {
    "savings-shared-001": {
        "user-a-1111": 800.00,  # Alex contributed $800 to Summer Vacation
        "user-b-2222": 400.00,  # Taylor contributed $400
    },
    "savings-shared-002": {
        "user-a-1111": 500.00,  # Alex contributed $500 to Emergency Fund
        "user-b-2222": 300.00,  # Taylor contributed $300
    },
}

# Mock Savings Goals — multiple per budget group
MOCK_SAVINGS_GOALS = {
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

# Mock Transactions
MOCK_TRANSACTIONS = [
    {
        "id": "t1",
        "group_id": "group-shared-123",
        "profile_id": "user-a-1111",
        "amount": 700.00,
        "type": "expense",
        "category": "Auto & Transport",
        "memo": "Monthly car loan payment",
        "date": (datetime.datetime.now() - datetime.timedelta(days=2)).isoformat()
    },
    {
        "id": "t2",
        "group_id": "group-shared-123",
        "profile_id": "user-b-2222",
        "amount": 350.00,
        "type": "expense",
        "category": "Auto & Transport",
        "memo": "Gas for the weekend trip",
        "date": (datetime.datetime.now() - datetime.timedelta(days=1)).isoformat()
    },
    {
        "id": "t3",
        "group_id": "group-shared-123",
        "profile_id": "user-a-1111",
        "amount": 250.00,
        "type": "expense",
        "category": "Auto & Transport",
        "memo": "Car insurance premium",
        "date": datetime.datetime.now().isoformat()
    },
    {
        "id": "t4",
        "group_id": "group-shared-123",
        "profile_id": "user-b-2222",
        "amount": 320.00,
        "type": "expense",
        "category": "Bill & Utilities",
        "memo": "Electricity and Wifi bills",
        "date": datetime.datetime.now().isoformat()
    },
    {
        "id": "t5",
        "group_id": "group-shared-123",
        "profile_id": "user-a-1111",
        "amount": 1000.00,
        "type": "income",
        "category": "Salary / Injection",
        "memo": "Freelance design payout",
        "date": (datetime.datetime.now() - datetime.timedelta(days=5)).isoformat()
    },
    # Caroline's transactions (Unlinked)
    {
        "id": "t6",
        "group_id": "group-unlinked-456",
        "profile_id": "user-c-3333",
        "amount": 300.20,
        "type": "expense",
        "category": "Transportation",
        "memo": "Commuter train pass",
        "date": (datetime.datetime.now() - datetime.timedelta(days=3)).isoformat()
    },
    {
        "id": "t7",
        "group_id": "group-unlinked-456",
        "profile_id": "user-c-3333",
        "amount": 200.00,
        "type": "expense",
        "category": "House",
        "memo": "New desk lamp",
        "date": (datetime.datetime.now() - datetime.timedelta(days=1)).isoformat()
    }
]
