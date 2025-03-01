-- Drop existing policies if they exist
drop policy if exists "Allow all operations for authenticated users" on public.scrape_results;
drop policy if exists "Allow read-only access for anonymous users" on public.scrape_results;

-- Create a new policy that allows all operations for anonymous users
create policy "Allow all operations for anonymous users"
    on public.scrape_results
    for all
    to anon
    using (true)
    with check (true);

-- Enable RLS on the table
alter table public.scrape_results enable row level security; 