/**
 * Browser Supabase client for use in Client Components.
 * Uses @supabase/ssr for session/cookie support.
 */
import { createClient } from "@/lib/supabase/client";

export const supabase = createClient();
