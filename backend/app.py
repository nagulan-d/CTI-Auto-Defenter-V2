from flask import Flask, jsonify, request
from flask_mail import Mail, Message
from flask_migrate import Migrate
from flask_cors import CORS, cross_origin
import requests
import os
from dotenv import load_dotenv
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import jwt  # This should now work with PyJWT after reinstalling
from datetime import datetime, timedelta
from functools import wraps

# Import summarizer + scorer
from summarizer import summarize_threat, init_client as init_summarizer
from scorer import score_threat, init_client as init_scorer

# ---------------- SETUP ----------------
load_dotenv()

app = Flask(__name__)

# CORS config: restrict to local dev origins so browsers will accept credentials headers correctly.
# Using explicit origins prevents the browser from rejecting Access-Control-Allow-Credentials.
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000", "http://127.0.0.1:3000"]}},
    supports_credentials=False, expose_headers=["X-ADMIN-KEY"]) 

# ---------------- CONFIG ----------------
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "default_secret")
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", "sqlite:///users.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Email Configs (from .env)
app.config["MAIL_SERVER"] = os.getenv("MAIL_SERVER", "smtp.gmail.com")
app.config["MAIL_PORT"] = int(os.getenv("MAIL_PORT", 587))
app.config["MAIL_USE_TLS"] = os.getenv("MAIL_USE_TLS", "True").lower() == "true"
app.config["MAIL_USERNAME"] = os.getenv("MAIL_USERNAME")
app.config["MAIL_PASSWORD"] = os.getenv("MAIL_PASSWORD")
app.config["MAIL_DEFAULT_SENDER"] = app.config["MAIL_USERNAME"]

mail = Mail(app)

# API Keys
API_KEY = os.getenv("API_KEY")
API_URL = os.getenv("API_URL")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
NOTIFY_THRESHOLD = int(os.getenv("NOTIFY_THRESHOLD", 80))
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")

db = SQLAlchemy(app)
migrate = Migrate(app, db)

# Initialize Gemini clients only if API key is present
if GEMINI_API_KEY:
    try:
        init_summarizer(GEMINI_API_KEY)
        init_scorer(GEMINI_API_KEY)
    except Exception as e:
        # Fail gracefully — AI features will fallback to local heuristics
        print(f"Warning: failed to initialize Gemini clients: {e}")
else:
    print("Warning: GEMINI_API_KEY not set — Gemini client not initialized; summaries/scores will use fallbacks.")

# ---------------- MODELS ----------------
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    phone = db.Column(db.String(20), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(10), default="user")  # user or admin
    subscribed = db.Column(db.Boolean, default=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

# ---------------- EMAIL FUNCTION ----------------
def send_email_notification(to_email, subject, body):
    try:
        msg = Message(subject=subject, recipients=[to_email])
        msg.body = body
        mail.send(msg)
        print(f"✅ Email sent successfully to {to_email}")
        return True
    except Exception as e:
        print(f"❌ Failed to send email to {to_email}: {e}")
        return False

# ---------------- AUTH DECORATOR ----------------
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Allow admin API key as an alternative authentication method
        admin_key = request.headers.get("X-ADMIN-KEY")
        if admin_key:
            if ADMIN_API_KEY and admin_key == ADMIN_API_KEY:
                # create a lightweight admin-like object
                class AdminProxy:
                    pass
                admin = AdminProxy()
                admin.id = 0
                admin.role = "admin"
                return f(admin, *args, **kwargs)
            else:
                return jsonify({"error": "Invalid admin key"}), 401

        token = request.headers.get("Authorization")
        if not token:
            return jsonify({"error": "Token missing"}), 401
        if token.startswith("Bearer "):
            token = token[7:]
        try:
            data = jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])
            current_user = User.query.get(data["user_id"])
            if not current_user:
                return jsonify({"error": "User not found"}), 401
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        return f(current_user, *args, **kwargs)
    return decorated

# ---------------- ROUTES ----------------
@app.route("/", methods=["GET"])
def home():
    return jsonify({"message": "🚀 Threat Intelligence API is running!"})

# --- Register New User ---
@app.route("/api/register", methods=["POST", "OPTIONS"])
@cross_origin(origins=["http://localhost:3000", "http://127.0.0.1:3000"])  # explicit dev origins
def register():
    try:
        # Dev debug: log incoming headers and raw body to help diagnose CORS/JSON parsing issues
        print("/api/register called — headers:\n", dict(request.headers))
        try:
            raw = request.get_data(as_text=True)
            print("/api/register raw body:\n", raw)
        except Exception:
            print("/api/register: could not read raw body")

        if not request.is_json:
            return jsonify({"error": "Expected application/json"}), 400
        data = request.get_json(force=True)
        username = data.get("username")
        email = data.get("email")
        phone = data.get("phone")
        password = data.get("password")
        subscribed = bool(data.get("subscribed", False))

        if not username or not email or not phone or not password:
            return jsonify({"error": "Missing required fields"}), 400
        if len(password) < 8:
            return jsonify({"error": "Password must be at least 8 characters"}), 400
        if User.query.filter((User.username == username) | (User.email == email)).first():
            return jsonify({"error": "Username or email already exists"}), 400

        new_user = User(username=username, email=email, phone=phone, subscribed=subscribed)
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()

        return jsonify({"message": "✅ User registered successfully"}), 201
    except Exception as e:
        # Log full exception to server console for debugging; ensure a JSON error is returned
        import traceback
        tb = traceback.format_exc()
        print(tb)
        # Also persist the traceback and the last request body to a file for inspection
        try:
            with open('register_error.log', 'a', encoding='utf-8') as f:
                f.write('\n--- /api/register error ---\n')
                f.write('Headers:\n')
                try:
                    f.write(str(dict(request.headers)) + '\n')
                except Exception:
                    f.write('Could not read headers\n')
                try:
                    f.write('Body:\n' + (request.get_data(as_text=True) or '') + '\n')
                except Exception:
                    f.write('Could not read body\n')
                f.write('Traceback:\n')
                f.write(tb + '\n')
        except Exception as _write_err:
            print('Failed to write register_error.log:', _write_err)
        return jsonify({"error": "Internal server error - see backend logs"}), 500

# --- Login User ---
@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")

    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password):
        token = jwt.encode({
            "user_id": user.id,
            "exp": datetime.utcnow() + timedelta(hours=4)
        }, app.config["SECRET_KEY"], algorithm="HS256")
        return jsonify({"token": token, "role": user.role}), 200
    return jsonify({"error": "Invalid credentials"}), 401

# --- Admin: View All Users ---
@app.route("/api/users", methods=["GET"])
@token_required
def get_users(current_user):
    if current_user.role != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    users = User.query.all()
    users_data = [{
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "phone": u.phone,
        "role": u.role,
        "subscribed": bool(getattr(u, 'subscribed', False))
    } for u in users]
    return jsonify(users_data)


# --- Admin: Delete User ---
@app.route("/api/users/<int:user_id>", methods=["DELETE"])
@token_required
def delete_user(current_user, user_id):
    # Only admins can delete users
    if current_user.role != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    # Prevent admin from deleting themselves
    if current_user.id == user_id:
        return jsonify({"error": "Cannot delete the currently authenticated admin"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    try:
        db.session.delete(user)
        db.session.commit()
        return jsonify({"message": "User deleted successfully"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting user {user_id}: {e}")
        return jsonify({"error": "Failed to delete user"}), 500


# --- Admin: Update user (partial update allowed, e.g., subscribed flag) ---
@app.route("/api/users/<int:user_id>", methods=["PATCH"])
@token_required
def update_user(current_user, user_id):
    # Only admins can update other users
    if current_user.role != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True) or {}
    # Support toggling subscribed flag
    if 'subscribed' in data:
        try:
            user.subscribed = bool(data.get('subscribed'))
            db.session.add(user)
            db.session.commit()
            return jsonify({
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "phone": user.phone,
                "role": user.role,
                "subscribed": bool(getattr(user, 'subscribed', False))
            }), 200
        except Exception as e:
            db.session.rollback()
            print(f"Error updating user {user_id}: {e}")
            return jsonify({"error": "Failed to update user"}), 500

    return jsonify({"error": "No updatable fields provided"}), 400

# --- Threat Intelligence Endpoint --- (Updated: Removed auto-email sending)
@app.route("/api/threats", methods=["GET"])
def get_threats():
    # If external API is not configured, return a small sample response so the UI can run locally
    if not API_URL or not API_KEY:
        sample = [{
            "title": "Sample Threat",
            "indicator": "192.0.2.1",
            "type": "IPv4",
            "summary": "This is a sample threat used when no external API is configured.",
            "score": 25,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "alert": False
        }]
        return jsonify(sample)

    headers = {"X-OTX-API-KEY": API_KEY}
    try:
        response = requests.get(API_URL, headers=headers, timeout=100)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Failed to fetch OTX data: {str(e)}"}), 500

    try:
        data = response.json()
        threats = []

        for pulse in data.get("results", [])[:3]:
            pulse_title = pulse.get("name", "Unknown Threat")
            for i in pulse.get("indicators", [])[:5]:
                indicator_value = i.get("indicator", "N/A")
                indicator_type = i.get("type", "N/A")

                # Add try-except for Gemini calls
                try:
                    summary = summarize_threat(i, pulse_title=pulse_title)
                    score = score_threat(indicator_value, pulse_title)
                except Exception as e:
                    print(f"Gemini error for {indicator_value}: {e}")
                    summary = "Summary unavailable"
                    score = 0  # Default low score

                timestamp = pulse.get("created", "N/A")

                threat_info = {
                    "title": pulse_title,
                    "indicator": indicator_value,
                    "type": indicator_type,
                    "summary": summary,
                    "score": score,
                    "timestamp": timestamp,
                    "alert": score >= NOTIFY_THRESHOLD
                }
                threats.append(threat_info)

        return jsonify(threats)
    except Exception as e:
        print(f"Unexpected error in /api/threats: {e}")
        return jsonify({"error": "Internal server error"}), 500

# --- New Endpoint: Manual Email Notification (Admin Only) ---
@app.route("/api/send-notification", methods=["POST"])
@token_required
def send_notification(current_user):
    if current_user.role != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    threat = data.get("threat")  # Expect the full threat object
    user_email = data.get("user_email")  # Target user's email

    if not threat or (not user_email and not data.get('send_to_all')):
        return jsonify({"error": "Missing threat or target"}), 400

    # Build the email content from the threat data
    subject = f"🚨 High-Risk Threat Detected: {threat.get('title', 'Unknown')}"
    body = f"""
Hello,

A threat notification has been sent:

📛 Title: {threat.get('title', 'N/A')}
🔍 Indicator: {threat.get('indicator', 'N/A')}
📈 Score: {threat.get('score', 'N/A')}
📝 Summary: {threat.get('summary', 'N/A')}
🕒 Timestamp: {threat.get('timestamp', 'N/A')}

Please review this threat immediately.

— Threat Intelligence System
"""

    # If frontend requested sending to all users, iterate and send
    send_to_all = False
    if isinstance(user_email, str) and user_email.upper() == 'ALL':
        send_to_all = True
    if data.get('send_to_all'):
        send_to_all = True

    if send_to_all:
        users = User.query.all()
        successes = 0
        failures = 0
        for u in users:
            try:
                ok = send_email_notification(u.email, subject, body)
                if ok:
                    successes += 1
                else:
                    failures += 1
            except Exception as e:
                print(f"Error sending to {u.email}: {e}")
                failures += 1
        return jsonify({"message": "Batch send complete", "sent": successes, "failed": failures}), 200

    # Otherwise send to a single user
    if send_email_notification(user_email, subject, body):
        return jsonify({"message": "Notification sent successfully"}), 200
    else:
        return jsonify({"error": "Failed to send notification"}), 500

# ---------------- RUN ----------------
if __name__ == "__main__":
    # Ensure there is at least one admin user for development convenience
    with app.app_context():
        try:
            # Create tables if they don't exist (useful when running without migrations)
            # Also ensure 'subscribed' column exists (add it for sqlite if missing)
            db.create_all()
            try:
                from sqlalchemy import inspect
                inspector = inspect(db.engine)
                cols = [c['name'] for c in inspector.get_columns('user')]
                if 'subscribed' not in cols:
                    # add column for sqlite
                    try:
                        db.engine.execute('ALTER TABLE user ADD COLUMN subscribed BOOLEAN DEFAULT 0')
                        print('Added subscribed column to user table')
                    except Exception as _e:
                        print('Failed to add subscribed column via ALTER TABLE:', _e)
            except Exception:
                pass
            admin_exists = User.query.filter_by(role="admin").first()
            if not admin_exists:
                default_admin_username = os.getenv("DEV_ADMIN_USERNAME", "admin")
                default_admin_password = os.getenv("DEV_ADMIN_PASSWORD", "admin123")
                default_admin_email = os.getenv("DEV_ADMIN_EMAIL", "admin@example.com")
                default_admin_phone = os.getenv("DEV_ADMIN_PHONE", "0000000000")
                new_admin = User(username=default_admin_username, email=default_admin_email, phone=default_admin_phone, role="admin")
                new_admin.set_password(default_admin_password)
                db.session.add(new_admin)
                db.session.commit()
                print(f"✅ Created default admin user '{default_admin_username}' (dev only)")
        except Exception as e:
            print(f"Warning: failed to ensure default admin user: {e}")
    app.run(debug=True, host="0.0.0.0", port=5000)