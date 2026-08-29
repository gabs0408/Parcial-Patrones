import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gmmztxqokjvyzylmepwb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtbXp0eHFva2p2eXp5bG1lcHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMTUzMTksImV4cCI6MjEwMjg5MTMxOX0.DNbqM4zolsnzVNPlgj9ihDmfPE3i80KqcUb_5Pad-xo'; 

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);