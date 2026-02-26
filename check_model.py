import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

def check_model():
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    try:
        # Try to list models or just generate a tiny bit of content
        print("Checking model: gemini-3-flash-preview")
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents="say hi"
        )
        print("Success:", response.text) 
    except Exception as e:
        print("Failed:", e)

    try:
        print("\nChecking model: gemini-2.0-flash")
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents="say hi"
        )
        print("Success:", response.text)
    except Exception as e:
        print("Failed:", e)

if __name__ == "__main__":
    check_model()
