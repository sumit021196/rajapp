-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create auth schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS auth;

-- Drop existing tables if they exist (with CASCADE to handle dependencies)
DROP TABLE IF EXISTS auth.auth_tokens CASCADE;
DROP TABLE IF EXISTS auth.users CASCADE;

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS auth.update_updated_at_column();

-- Create users table with auth fields
CREATE TABLE auth.users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    last_sign_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX idx_users_phone_number ON auth.users(phone_number);
CREATE INDEX idx_users_username ON auth.users(username);

-- Add RLS policies
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own data"
    ON auth.users FOR SELECT
    USING (auth.uid()::text = id::text);

CREATE POLICY "Service role can manage users"
    ON auth.users FOR ALL
    USING (auth.role() = 'service_role');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION auth.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for users table
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION auth.update_updated_at_column(); 