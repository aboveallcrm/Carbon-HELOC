#!/usr/bin/env node
/**
 * Set Super Admin Role
 * 
 * This script sets a user as super_admin in the user_roles table.
 * 
 * Usage:
 *   node set-super-admin.js <service-role-key> <user-email>
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://czzabvfzuxhpdcowgvam.supabase.co';

async function setSuperAdmin() {
    const serviceRoleKey = process.argv[2];
    const userEmail = process.argv[3];
    
    if (!serviceRoleKey || !userEmail) {
        console.error('❌ Error: Missing arguments');
        console.error('');
        console.error('Usage: node set-super-admin.js <service-role-key> <user-email>');
        process.exit(1);
    }

    console.log('🔌 Connecting to Supabase...');
    const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    try {
        // First, find the user by email using admin API
        console.log(`🔍 Looking up user: ${userEmail}`);
        
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        
        if (listError) {
            console.error('❌ Failed to list users:', listError.message);
            process.exit(1);
        }

        const user = users.find(u => u.email === userEmail);
        
        if (!user) {
            console.error(`❌ User not found: ${userEmail}`);
            console.log('');
            console.log('Available users:');
            users.forEach(u => console.log(`  - ${u.email}`));
            process.exit(1);
        }

        console.log(`✅ Found user: ${user.id}`);
        console.log('');

        // Check if user_roles table exists
        const { error: tableCheckError } = await supabase
            .from('user_roles')
            .select('count', { count: 'exact', head: true });

        if (tableCheckError && tableCheckError.code === '42P01') {
            console.log('⚠️  user_roles table does not exist. Creating it...');
            
            // Create user_roles table
            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS user_roles (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'user')),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(user_id, role)
                );
                
                CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
                CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
                
                ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
                
                DROP POLICY IF EXISTS "Super admins can manage roles" ON user_roles;
                DROP POLICY IF EXISTS "Users can view own roles" ON user_roles;
                
                CREATE POLICY "Super admins can manage roles" 
                    ON user_roles FOR ALL 
                    USING (EXISTS (
                        SELECT 1 FROM user_roles 
                        WHERE user_id = auth.uid() 
                        AND role = 'super_admin'
                    ));
                
                CREATE POLICY "Users can view own roles" 
                    ON user_roles FOR SELECT 
                    USING (auth.uid() = user_id);
            `;

            // Try to create via RPC or direct query
            const { error: createError } = await supabase.rpc('exec_sql', { sql: createTableSQL });
            
            if (createError) {
                console.log('⚠️  Could not create table automatically.');
                console.log('Please run this SQL in the Supabase SQL Editor:');
                console.log('');
                console.log(createTableSQL);
                process.exit(1);
            }
            
            console.log('✅ user_roles table created');
        }

        // Check if user already has super_admin role
        const { data: existingRole, error: roleCheckError } = await supabase
            .from('user_roles')
            .select('*')
            .eq('user_id', user.id)
            .eq('role', 'super_admin')
            .single();

        if (existingRole) {
            console.log(`✅ User ${userEmail} is already a super_admin`);
            console.log('');
            console.log('Role details:');
            console.log(`  - User ID: ${existingRole.user_id}`);
            console.log(`  - Role: ${existingRole.role}`);
            console.log(`  - Assigned: ${existingRole.created_at}`);
            return;
        }

        // Insert super_admin role
        console.log('📝 Assigning super_admin role...');
        
        const { data: insertedRole, error: insertError } = await supabase
            .from('user_roles')
            .insert({
                user_id: user.id,
                role: 'super_admin'
            })
            .select()
            .single();

        if (insertError) {
            console.error('❌ Failed to assign role:', insertError.message);
            process.exit(1);
        }

        console.log('');
        console.log('✅ Super admin role assigned successfully!');
        console.log('');
        console.log('User details:');
        console.log(`  - Email: ${userEmail}`);
        console.log(`  - User ID: ${user.id}`);
        console.log(`  - Role: super_admin`);
        console.log('');
        console.log('The user can now access the Super Admin panel in the HELOC tool.');

    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
        process.exit(1);
    }
}

setSuperAdmin();
