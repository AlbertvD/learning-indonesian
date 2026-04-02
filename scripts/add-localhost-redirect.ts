// Add localhost:5173 to Supabase auth redirect URLs
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://api.supabase.duin.home'
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY not set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
})

async function addLocalhostRedirect() {
  try {
    console.log('📝 Adding localhost:5173 to auth redirect URLs...')

    // Fetch current auth config
    const { error } = await supabase
      .from('auth.config')
      .select('*')
      .single()

    if (error) {
      console.warn('⚠️  Could not fetch auth config from DB:', error.message)
      console.log('ℹ️  You may need to manually add redirects in Supabase Studio:')
      console.log('   https://api.supabase.duin.home/project/default/auth/redirect-urls')
      console.log('')
      console.log('Add these URLs:')
      console.log('  - http://localhost:5173')
      console.log('  - http://localhost:5173/')
      process.exit(1)
    }

    console.log('✅ Auth configuration found')
    console.log('⚠️  Redirect URL updates via API require Supabase management endpoints')
    console.log('    which may not be available in self-hosted instances.')
    console.log('')
    console.log('Please manually add to Supabase Studio:')
    console.log('https://api.supabase.duin.home/project/default/auth/redirect-urls')
    console.log('')
    console.log('Add these:')
    console.log('  • http://localhost:5173')
    console.log('  • http://localhost:5173/')
  } catch (err) {
    console.error('❌ Error:', err)
    process.exit(1)
  }
}

addLocalhostRedirect()
