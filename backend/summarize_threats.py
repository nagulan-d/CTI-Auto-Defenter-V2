import google.generativeai as genai
import os
from dotenv import load_dotenv

# Load env variables
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Configure Gemini client
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-1.5-flash")

def summarize_threat(indicator, pulse_title=""):
    """Summarize threat details using Gemini API"""
    prompt = f"""
    Summarize this threat indicator in 2-3 sentences:
    Pulse: {pulse_title}
    Indicator: {indicator.get("indicator")}
    Type: {indicator.get("type")}
    Description: {indicator.get("description", "No description available")}
    """
    try:
        response = model.generate_content(prompt)
        return response.text.strip() if response else "Summary unavailable"
    except Exception as e:
        return f"Error generating summary: {str(e)}"
