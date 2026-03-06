-- Ensure barraganmortgage@gmail.com (795aea13-6aba-45f2-97d4-04576f684557) is always super_admin + diamond
UPDATE public.profiles
SET role = 'super_admin',
    current_tier = 'diamond'
WHERE id = '795aea13-6aba-45f2-97d4-04576f684557';
