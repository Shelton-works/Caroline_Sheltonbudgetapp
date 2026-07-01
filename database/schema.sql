-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Create budget_groups table
create table public.budget_groups (
    id uuid primary key default uuid_generate_v4(),
    name text,
    fluid_balance numeric(12, 2) not null default 0.00,
    monthly_limit numeric(12, 2) not null default 2000.00,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create profiles table
create table public.profiles (
    id uuid primary key references auth.users on delete cascade,
    email text,
    display_name text,
    avatar_url text,
    group_id uuid references public.budget_groups(id) on delete set null,
    expo_push_token text,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create partner_codes table
create table public.partner_codes (
    code text primary key,
    creator_id uuid references public.profiles(id) on delete cascade not null,
    group_id uuid references public.budget_groups(id) on delete cascade not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    is_used boolean default false not null
);

-- 4. Create transactions table
create table public.transactions (
    id uuid primary key default uuid_generate_v4(),
    group_id uuid references public.budget_groups(id) on delete cascade not null,
    profile_id uuid references public.profiles(id) on delete cascade not null,
    amount numeric(12, 2) not null,
    type text check (type in ('expense', 'income')) not null,
    category text not null,
    memo text not null,
    date timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on all public tables
alter table public.budget_groups enable row level security;
alter table public.profiles enable row level security;
alter table public.partner_codes enable row level security;
alter table public.transactions enable row level security;

-- Policies for profiles
create policy "Users can view any profile"
    on public.profiles for select
    using (true);

create policy "Users can update their own profile"
    on public.profiles for update
    using (auth.uid() = id);

-- Policies for budget_groups
create policy "Users can view their own budget group"
    on public.budget_groups for select
    using (
        exists (
            select 1 from public.profiles
            where profiles.group_id = budget_groups.id
            and profiles.id = auth.uid()
        )
    );

create policy "Users can update their own budget group"
    on public.budget_groups for update
    using (
        exists (
            select 1 from public.profiles
            where profiles.group_id = budget_groups.id
            and profiles.id = auth.uid()
        )
    );

-- Policies for partner_codes
create policy "Users can insert partner codes"
    on public.partner_codes for insert
    with check (auth.uid() = creator_id);

create policy "Users can view partner codes"
    on public.partner_codes for select
    using (true);

create policy "Users can update partner codes"
    on public.partner_codes for update
    using (true);

-- Policies for transactions
create policy "Users can view transactions in their group"
    on public.transactions for select
    using (
        exists (
            select 1 from public.profiles
            where profiles.group_id = transactions.group_id
            and profiles.id = auth.uid()
        )
    );

create policy "Users can insert transactions in their group"
    on public.transactions for insert
    with check (
        exists (
            select 1 from public.profiles
            where profiles.group_id = transactions.group_id
            and profiles.id = auth.uid()
        )
    );

create policy "Users can update/delete transactions in their group"
    on public.transactions for all
    using (
        exists (
            select 1 from public.profiles
            where profiles.group_id = transactions.group_id
            and profiles.id = auth.uid()
        )
    );

-- Trigger to automatically create a profile and default budget group when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
declare
    new_group_id uuid;
begin
    -- Create a default budget group for the user
    insert into public.budget_groups (name, fluid_balance, monthly_limit)
    values ('My Budget', 0.00, 2000.00)
    returning id into new_group_id;

    -- Insert the new user profile
    insert into public.profiles (id, email, display_name, group_id)
    values (new.id, new.email, split_part(new.email, '@', 1), new_group_id);

    return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();
