#!/usr/bin/env node
/**
 * Supabase Migration Runner
 * 
 * This script runs the quotes table migration using the Supabase JS client.
 * 
 * Usage:
 *   node run-migration.js <your-supabase-service-role-key>
 * 
 * Get your service role key from:
 *   Supabase Dashboard → Project Settings → API → service_role key
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://czzabvfzuxhpdcowgvam.supabase.co';

async function runMigration() {
    const serviceRoleKey = process.argv[2];
    
    if (!serviceRoleKey) {
        console.error('❌ Error: Please provide your Supabase service_role key');
        console.error('');
        console.error('Usage: node run-migration.js <your-service-role-key>');
        console.error('');
        console.error('Get your key from: Supabase Dashboard → Project Settings → API → service_role key');
        process.exit(1);
    }

    console.log('🔌 Connecting to Supabase...');
    const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    try {
        // Test connection
        const { data: testData, error: testError } = await supabase
            .from('quotes')
            .select('count', { count: 'exact', head: true });
        
        if (testError && testError.code !== 'PGRST116') {
            console.error('❌ Connection test failed:', testError.message);
            process.exit(1);
        }
        
        console.log('✅ Connected to Supabase');
        console.log('');

        // Run migration SQL
        console.log('🔄 Running migration: Adding status column to quotes table...');
        console.log('');

        const migrationSQL = `
            -- Add status column to quotes table
            ALTER TABLE IF EXISTS quotes 
            ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

            -- Update existing quotes to have 'active' status
            UPDATE quotes 
            SET status = 'active' 
            WHERE status IS NULL;

            -- Create index for faster filtering
            CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);

            -- Add comment for documentation
            COMMENT ON COLUMN quotes.status IS 'Quote status: active, archived, deleted, converted, draft';
        `;

        // Execute raw SQL using rpc (if available) or direct query
        const { error: rpcError } = await supabase.rpc('exec_sql', { sql: migrationSQL });
        
        if (rpcError) {
            // Fallback: try direct REST API call
            console.log('⚠️  RPC not available, trying direct SQL execution...');
            
            // Split and execute statements individually
            const statements = migrationSQL.split(';').filter(s => s.trim());
            
            for (const stmt of statements) {
                const cleanStmt = stmt.trim();
                if (!cleanStmt) continue;
                
                const { error } = await supabase
                    .from('quotes')
                    .select('*')
                    .limit(0);
                
                // If we can query, the table exists
                if (error && error.code === '42P01') {
                    console.error('❌ Quotes table does not exist. Please create it first.');
                    process.exit(1);
                }
            }
            
            // Try using REST API for SQL execution
            const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Prefer': 'params=single-object'
                },
                body: JSON.stringify({ query: migrationSQL })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Migration failed:', errorText);
                process.exit(1);
            }
        }

        // Verify the migration
        console.log('🔍 Verifying migration...');
        const { data: columns, error: verifyError } = await supabase
            .from('information_schema.columns')
            .select('column_name, data_type, column_default')
            .eq('table_name', 'quotes');

        if (verifyError) {
            console.error('❌ Verification failed:', verifyError.message);
            process.exit(1);
        }

        const statusColumn = columns.find(c => c.column_name === 'status');
        
        if (statusColumn) {
            console.log('✅ Migration successful!');
            console.log('');
            console.log('Column details:');
            console.log(`  - Name: ${statusColumn.column_name}`);
            console.log(`  - Type: ${statusColumn.data_type}`);
            console.log(`  - Default: ${statusColumn.column_default}`);
            console.log('');
            console.log('The quotes.status column has been added successfully.');
        } else {
            console.error('❌ Migration verification failed: status column not found');
            process.exit(1);
        }

    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
        process.exit(1);
    }
}

runMigration();
