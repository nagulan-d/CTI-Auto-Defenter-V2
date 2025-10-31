import google.generativeai as genai

client = None

def init_client(api_key):
    """Initialize Gemini client"""
    global client
    genai.configure(api_key=api_key)
    client = genai.GenerativeModel("gemini-1.5-flash")

def summarize_threat(indicator, pulse_title="Unknown Threat"):
    """
    Generates a short & sweet summary using Gemini AI.
    If Gemini is unavailable, falls back to a quick local summary.
    """
    indicator_value = indicator.get("indicator", "Unknown")
    indicator_type = indicator.get("type", "Unknown")

    # Fallback quick summary
    fallback_summary = f"{indicator_type} linked to {pulse_title}"

    if client is None:
        return fallback_summary

    try:
        prompt = (
            "Summarize this cybersecurity threat in ONE short sentence.\n\n"
            f"Pulse: {pulse_title}\n"
            f"Indicator: {indicator_value}\n"
            f"Type: {indicator_type}"
        )
        response = client.generate_content(prompt)
        summary = response.text.strip()
        # Ensure it's not empty or too long
        if summary and len(summary) < 200:
            return summary
        else:
            return fallback_summary
    except Exception:
        return fallback_summary