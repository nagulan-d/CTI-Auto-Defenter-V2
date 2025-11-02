import os
import requests
from dotenv import load_dotenv
from summarize_threats import summarize_threat  

# Load environment variables from .env
load_dotenv()

api_key = os.getenv("API_KEY")   # AlienVault OTX API Key
api_url = os.getenv("API_URL")   # AlienVault OTX API URL

headers = {
    "X-OTX-API-KEY": api_key
}

response = requests.get(api_url, headers=headers)

if response.status_code == 200:
    data = response.json()
    print("✅ Fetched threat data successfully!\n")

    indicators = []

    for result in data.get("results", []):
        indicators.extend(result.get("indicators", []))

    for indicator in indicators:
        summary = summarize_threat(indicator)   # Uses Gemini
        print(f"\n🔹 Indicator: {indicator['indicator']}")
        print(f"📌 Type: {indicator['type']}")
        print(f"📝 Summary:\n{summary}\n")

else:
    print("❌ Failed to fetch data. Status Code:", response.status_code)
