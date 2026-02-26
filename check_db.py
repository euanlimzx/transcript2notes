import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

def check():
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    print(f"URL: {url}")
    print(f"Key starts with: {key[:10]}...")
    
    try:
        supabase = create_client(url, key)
        res = supabase.table("conversions").select("id").limit(1).execute()
        print("Success! Found records:", len(res.data))
    except Exception as e:
        print("Error connecting to Supabase:", e)

if __name__ == "__main__":
    check()
