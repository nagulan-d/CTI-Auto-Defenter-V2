import google.generativeai as genai

client = None

def init_client(api_key):
    """Initialize Gemini client"""
    global client
    genai.configure(api_key=api_key)
    client = genai.GenerativeModel("gemini-1.5-flash")
def summarize_threat(indicator, pulse_title="Unknown Threat", detail="short"):
    """
    Summarize a threat using Gemini.

    detail: "short" => one sentence; "detailed" => 3-5 sentences with impact
    If Gemini client not initialized or fails, returns simple fallbacks.
    """
    indicator_value = None
    indicator_type = None
    description = None
    if isinstance(indicator, dict):
        indicator_value = indicator.get("indicator", "Unknown")
        indicator_type = indicator.get("type", "Unknown")
        description = indicator.get("description", "No description available")
    else:
        indicator_value = str(indicator)
        indicator_type = "Unknown"
        description = "No description available"

    # Fallback summaries
    fallback_short = f"{indicator_type} ({indicator_value}) associated with {pulse_title}."
    fallback_detailed = (
        f"{indicator_type} ({indicator_value}) related to {pulse_title}. "
        "This indicator may indicate suspicious activity; verify with IDS/connection logs and block if confirmed."
    )

    if client is None:
        return fallback_short if detail == "short" else fallback_detailed

    # Build prompt based on requested detail
    if detail == "short":
        prompt = (
            "Summarize this cybersecurity threat in ONE clear short sentence for an end user.\n\n"
            f"Pulse: {pulse_title}\n"
            f"Indicator: {indicator_value}\n"
            f"Type: {indicator_type}\n"
            f"Description: {description}\n"
            "Keep it short, non-technical, and actionable."
        )
    else:
        prompt = (
            "Provide a concise but detailed summary (3-5 sentences) describing the likely impact, probable cause, and recommended immediate actions for this cybersecurity threat.\n\n"
            f"Pulse: {pulse_title}\n"
            f"Indicator: {indicator_value}\n"
            f"Type: {indicator_type}\n"
            f"Description: {description}\n"
            "Include suggested next steps (investigation and mitigation) and an estimated severity."
        )

    try:
        response = client.generate_content(prompt)
        summary = getattr(response, "text", None)
        if not summary:
            return fallback_short if detail == "short" else fallback_detailed
        summary = summary.strip()
        # Basic length guard
        if detail == "short" and len(summary) > 400:
            return summary.split(".")[0] + "."
        return summary
    except Exception as e:
        # Log and return fallback
        try:
            print(f"Gemini summarize error: {e}")
        except Exception:
            pass
        return fallback_short if detail == "short" else fallback_detailed