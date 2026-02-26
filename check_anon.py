import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

def check_anon():
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY")
    print(f"URL: {url}")
    print(f"Anon Key: {key}")
    
    try:
        supabase = create_client(url, key)
        # Try to select
        res = supabase.table("conversions").select("id").limit(1).execute()
        print("Anon Read Success! Records:", len(res.data))
    except Exception as e:
        print("Anon Read Failed:", e)

if __name__ == "__main__":
    check_anon()
