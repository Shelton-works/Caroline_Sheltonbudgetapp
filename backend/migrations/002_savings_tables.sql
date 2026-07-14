-- Migration 002: Create savings_goals and savings_contributions tables
-- Apply this in your Supabase dashboard SQL editor if the automated script fails.

-- 1. Create savings_goals table
create table if not exists public.savings_goals (
    id uuid primary key default uuid_generate_v4(),
    group_id uuid references public.budget_groups(id) on delete cascade not null,
    name text not null,
    target_amount numeric(12, 2) not null default 1000.00,
    saved_amount numeric(12, 2) not null default 0.00,
    auto_save_percentage numeric(5, 2) not null default 0.00,
    sort_order integer not null default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.savings_goals enable row level security;

-- RLS policies for savings_goals
-- (IF NOT EXISTS omitted for PostgreSQL < 15 compatibility)
do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'savings_goals' and policyname = 'Users can view their group''s savings goals') then
        create policy "Users can view their group's savings goals"
            on public.savings_goals for select
            using (
                exists (
                    select 1 from public.profiles
                    where profiles.group_id = savings_goals.group_id
                    and profiles.id = auth.uid()
                )
            );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'savings_goals' and policyname = 'Users can insert savings goals in their group') then
        create policy "Users can insert savings goals in their group"
            on public.savings_goals for insert
            with check (
                exists (
                    select 1 from public.profiles
                    where profiles.group_id = savings_goals.group_id
                    and profiles.id = auth.uid()
                )
            );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'savings_goals' and policyname = 'Users can update savings goals in their group') then
        create policy "Users can update savings goals in their group"
            on public.savings_goals for update
            using (
                exists (
                    select 1 from public.profiles
                    where profiles.group_id = savings_goals.group_id
                    and profiles.id = auth.uid()
                )
            );
    end if;
end;
$$;

-- 2. Create savings_contributions table
create table if not exists public.savings_contributions (
    id uuid primary key default uuid_generate_v4(),
    goal_id uuid references public.savings_goals(id) on delete cascade not null,
    profile_id uuid references public.profiles(id) on delete cascade not null,
    amount numeric(12, 2) not null default 0.00,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(goal_id, profile_id)
);

alter table public.savings_contributions enable row level security;

-- RLS policies for savings_contributions
-- (IF NOT EXISTS omitted for PostgreSQL < 15 compatibility)
do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'savings_contributions' and policyname = 'Users can view their group''s savings contributions') then
        create policy "Users can view their group's savings contributions"
            on public.savings_contributions for select
            using (
                exists (
                    select 1 from public.savings_goals
                    inner join public.profiles on profiles.group_id = savings_goals.group_id
                    where savings_goals.id = savings_contributions.goal_id
                    and profiles.id = auth.uid()
                )
            );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'savings_contributions' and policyname = 'Users can insert savings contributions in their group') then
        create policy "Users can insert savings contributions in their group"
            on public.savings_contributions for insert
            with check (
                exists (
                    select 1 from public.savings_goals
                    inner join public.profiles on profiles.group_id = savings_goals.group_id
                    where savings_goals.id = savings_contributions.goal_id
                    and profiles.id = auth.uid()
                )
            );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'savings_contributions' and policyname = 'Users can update savings contributions in their group') then
        create policy "Users can update savings contributions in their group"
            on public.savings_contributions for update
            using (
                exists (
                    select 1 from public.savings_goals
                    inner join public.profiles on profiles.group_id = savings_goals.group_id
                    where savings_goals.id = savings_contributions.goal_id
                    and profiles.id = auth.uid()
                )
            );
    end if;
end;
$$;
