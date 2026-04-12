-- ============================================================
-- Token System for AI Usage
-- Adds token-based billing for AI features on top of tier subscriptions
-- ============================================================

-- Token balances per user
CREATE TABLE IF NOT EXISTS public.user_tokens (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  balance integer DEFAULT 0 NOT NULL,
  lifetime_earned integer DEFAULT 0 NOT NULL,
  lifetime_spent integer DEFAULT 0 NOT NULL,
  monthly_bonus_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.user_tokens ENABLE ROW LEVEL SECURITY;

-- Users can view own token balance
DROP POLICY IF EXISTS "user_tokens_own_select" ON public.user_tokens;
CREATE POLICY "user_tokens_own_select" ON public.user_tokens 
  FOR SELECT USING (auth.uid() = user_id);

-- Users cannot modify their own tokens directly (only via transactions)
-- Super admin can manage all tokens
DROP POLICY IF EXISTS "user_tokens_sa_all" ON public.user_tokens;
CREATE POLICY "user_tokens_sa_all" ON public.user_tokens 
  FOR ALL USING (is_super_admin());

-- Token transaction history
CREATE TABLE IF NOT EXISTS public.token_transactions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  type text NOT NULL CHECK (type IN ('purchase', 'monthly_bonus', 'usage', 'refund', 'admin_adjust', 'signup_bonus')),
  amount integer NOT NULL, -- positive for credits, negative for debits
  balance_after integer NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view own transactions
DROP POLICY IF EXISTS "token_transactions_own_select" ON public.token_transactions;
CREATE POLICY "token_transactions_own_select" ON public.token_transactions 
  FOR SELECT USING (auth.uid() = user_id);

-- Super admin can manage all transactions
DROP POLICY IF EXISTS "token_transactions_sa_all" ON public.token_transactions;
CREATE POLICY "token_transactions_sa_all" ON public.token_transactions 
  FOR ALL USING (is_super_admin());

-- Token pricing packages
CREATE TABLE IF NOT EXISTS public.token_pricing (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL,
  token_amount integer NOT NULL,
  price_cents integer NOT NULL, -- in cents (e.g., 499 = $4.99)
  tier_bonus_multiplier numeric(3,2) DEFAULT 1.00, -- multiplier for tier bonuses
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.token_pricing ENABLE ROW LEVEL SECURITY;

-- Everyone can view active pricing
DROP POLICY IF EXISTS "token_pricing_public_select" ON public.token_pricing;
CREATE POLICY "token_pricing_public_select" ON public.token_pricing 
  FOR SELECT USING (is_active = true);

-- Super admin can manage pricing
DROP POLICY IF EXISTS "token_pricing_sa_all" ON public.token_pricing;
CREATE POLICY "token_pricing_sa_all" ON public.token_pricing 
  FOR ALL USING (is_super_admin());

-- AI usage tracking (for analytics and billing)
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  feature_type text NOT NULL CHECK (feature_type IN ('strategy', 'sales_script', 'objection_handler', 'email_template', 'competitive_analysis', 'chat_message')),
  model text NOT NULL,
  tokens_input integer DEFAULT 0,
  tokens_output integer DEFAULT 0,
  tokens_cost integer DEFAULT 0, -- in tokens from user's balance
  quote_id uuid REFERENCES public.quotes,
  latency_ms integer,
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Users can view own usage
DROP POLICY IF EXISTS "ai_usage_own_select" ON public.ai_usage;
CREATE POLICY "ai_usage_own_select" ON public.ai_usage 
  FOR SELECT USING (auth.uid() = user_id);

-- Super admin can view all usage
DROP POLICY IF EXISTS "ai_usage_sa_all" ON public.ai_usage;
CREATE POLICY "ai_usage_sa_all" ON public.ai_usage 
  FOR ALL USING (is_super_admin());

-- ============================================================
-- Functions
-- ============================================================

-- Function to credit tokens to a user
CREATE OR REPLACE FUNCTION public.credit_tokens(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_description text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  -- Insert or update user_tokens
  INSERT INTO public.user_tokens (user_id, balance, lifetime_earned)
  VALUES (p_user_id, p_amount, p_amount)
  ON CONFLICT (user_id)
  DO UPDATE SET
    balance = user_tokens.balance + p_amount,
    lifetime_earned = user_tokens.lifetime_earned + p_amount,
    updated_at = timezone('utc'::text, now())
  RETURNING balance INTO v_new_balance;

  -- Record transaction
  INSERT INTO public.token_transactions (user_id, type, amount, balance_after, description, metadata)
  VALUES (p_user_id, p_type, p_amount, v_new_balance, p_description, p_metadata);

  RETURN v_new_balance;
END;
$$;

-- Function to debit tokens from a user (returns success boolean)
CREATE OR REPLACE FUNCTION public.debit_tokens(
  p_user_id uuid,
  p_amount integer,
  p_feature_type text,
  p_description text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
) RETURNS TABLE(success boolean, new_balance integer, error_message text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_current_balance integer;
  v_new_balance integer;
BEGIN
  -- Get current balance
  SELECT balance INTO v_current_balance
  FROM public.user_tokens
  WHERE user_id = p_user_id;

  -- Check if user has enough tokens
  IF v_current_balance IS NULL OR v_current_balance < p_amount THEN
    RETURN QUERY SELECT false, COALESCE(v_current_balance, 0), 'Insufficient tokens'::text;
    RETURN;
  END IF;

  -- Debit tokens
  UPDATE public.user_tokens
  SET balance = balance - p_amount,
      lifetime_spent = lifetime_spent + p_amount,
      updated_at = timezone('utc'::text, now())
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;

  -- Record transaction
  INSERT INTO public.token_transactions (user_id, type, amount, balance_after, description, metadata)
  VALUES (p_user_id, 'usage', -p_amount, v_new_balance, p_description, p_metadata);

  -- Record AI usage
  INSERT INTO public.ai_usage (user_id, feature_type, model, tokens_cost, metadata)
  VALUES (p_user_id, p_feature_type, p_metadata->>'model', p_amount, p_metadata);

  RETURN QUERY SELECT true, v_new_balance, NULL::text;
END;
$$;

-- Function to get token balance
CREATE OR REPLACE FUNCTION public.get_token_balance(p_user_id uuid)
RETURNS integer
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT COALESCE(balance, 0) FROM public.user_tokens WHERE user_id = p_user_id;
$$;

-- Function to apply monthly token bonus based on tier
CREATE OR REPLACE FUNCTION public.apply_monthly_bonus(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_tier text;
  v_bonus integer;
  v_last_bonus_date timestamp with time zone;
  v_user_tokens_id uuid;
BEGIN
  -- Get user's tier
  SELECT tier INTO v_tier FROM public.profiles WHERE id = p_user_id;
  
  -- Determine bonus amount based on tier
  v_bonus := CASE v_tier
    WHEN 'starter' THEN 100
    WHEN 'pro' THEN 500
    WHEN 'enterprise' THEN 2000
    ELSE 0
  END;

  -- Check if bonus already applied this month
  SELECT id, monthly_bonus_date INTO v_user_tokens_id, v_last_bonus_date
  FROM public.user_tokens
  WHERE user_id = p_user_id;

  -- If bonus was applied this month, skip
  IF v_last_bonus_date IS NOT NULL AND 
     DATE_TRUNC('month', v_last_bonus_date) = DATE_TRUNC('month', timezone('utc'::text, now())) THEN
    RETURN 0;
  END IF;

  -- Apply bonus
  IF v_user_tokens_id IS NULL THEN
    INSERT INTO public.user_tokens (user_id, balance, lifetime_earned, monthly_bonus_date)
    VALUES (p_user_id, v_bonus, v_bonus, timezone('utc'::text, now()));
  ELSE
    UPDATE public.user_tokens
    SET balance = balance + v_bonus,
        lifetime_earned = lifetime_earned + v_bonus,
        monthly_bonus_date = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE user_id = p_user_id;
  END IF;

  -- Record transaction
  INSERT INTO public.token_transactions (user_id, type, amount, balance_after, description)
  VALUES (p_user_id, 'monthly_bonus', v_bonus, 
          (SELECT balance FROM public.user_tokens WHERE user_id = p_user_id),
          'Monthly ' || v_tier || ' tier bonus');

  RETURN v_bonus;
END;
$$;

-- Trigger to apply signup bonus on profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user_with_tokens()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_bonus integer;
BEGIN
  -- Determine signup bonus based on tier
  v_bonus := CASE NEW.tier
    WHEN 'starter' THEN 50
    WHEN 'pro' THEN 200
    WHEN 'enterprise' THEN 1000
    ELSE 25
  END;

  -- Create token record with signup bonus
  INSERT INTO public.user_tokens (user_id, balance, lifetime_earned)
  VALUES (NEW.id, v_bonus, v_bonus);

  -- Record transaction
  INSERT INTO public.token_transactions (user_id, type, amount, balance_after, description)
  VALUES (NEW.id, 'signup_bonus', v_bonus, v_bonus, 'Welcome bonus for ' || COALESCE(NEW.tier, 'free') || ' tier');

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists and create new one
DROP TRIGGER IF EXISTS trg_new_user_tokens ON public.profiles;
CREATE TRIGGER trg_new_user_tokens
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_with_tokens();

-- ============================================================
-- Seed Data
-- ============================================================

-- Insert default token pricing packages
INSERT INTO public.token_pricing (name, token_amount, price_cents, tier_bonus_multiplier, sort_order)
VALUES 
  ('Starter Pack', 500, 499, 1.00, 1),      -- $4.99 for 500 tokens
  ('Pro Pack', 2000, 1499, 1.10, 2),        -- $14.99 for 2000 tokens (+10% bonus)
  ('Power Pack', 5000, 2999, 1.20, 3),      -- $29.99 for 5000 tokens (+20% bonus)
  ('Enterprise Pack', 15000, 7999, 1.50, 4) -- $79.99 for 15000 tokens (+50% bonus)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_token_transactions_user_id ON public.token_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_created_at ON public.token_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON public.ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON public.ai_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature_type ON public.ai_usage(feature_type);
