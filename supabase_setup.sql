-- Run this in Supabase SQL Editor to create the required tables

CREATE TABLE IF NOT EXISTS call_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_name text NOT NULL,
  call_date timestamptz DEFAULT now(),
  outcome text CHECK (outcome IN ('booked_followup', 'closed_won', 'closed_lost', 'no_decision')),
  integrations_pitched text[],
  integrations_activated text[],
  decision_maker text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_intelligence (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_name text UNIQUE NOT NULL,
  last_call_date timestamptz,
  total_calls integer DEFAULT 0,
  last_outcome text,
  key_contacts text,
  integrations_pitched text[],
  integrations_activated text[],
  cumulative_notes text,
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security (optional but good practice)
ALTER TABLE call_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_intelligence ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_role_all" ON call_notes FOR ALL USING (true);
CREATE POLICY "service_role_all" ON account_intelligence FOR ALL USING (true);
