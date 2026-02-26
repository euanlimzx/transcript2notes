import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

def check_data():
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    supabase = create_client(url, key)
    res = supabase.table("conversions").select("*").order("created_at", desc=True).limit(5).execute()
    for row in res.data:
        print(f"ID: {row['id']}")
        print(f"Status: {row['status']}")
        print(f"Markdown length: {len(row['markdown']) if row['markdown'] else 0}")
        print(f"Error: {row['error']}")
        print("---")

if __name__ == "__main__":
    check_data()
