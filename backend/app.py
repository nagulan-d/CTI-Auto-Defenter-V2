from flask import Flask, jsonify, request, Response
from flask_mail import Mail, Message
from flask_migrate import Migrate
from flask_cors import CORS, cross_origin
import json
import queue
import threading
import time
import requests
import os
from dotenv import load_dotenv
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
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
CORS(app,
    resources={r"/api/*": {"origins": [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001"
    ]}},
    # Allow credentials during local development (cookies/authorization headers)
    supports_credentials=True,
    expose_headers=["X-ADMIN-KEY"],
    allow_headers=["Content-Type", "Authorization", "X-ADMIN-KEY"])

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


# ---------------- THREAT MODEL ----------------
class Threat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    indicator = db.Column(db.String(255), nullable=False, index=True)
    type = db.Column(db.String(80), nullable=True)
    description = db.Column(db.Text, nullable=True)
    summary = db.Column(db.Text, nullable=True)
    summary_short = db.Column(db.Text, nullable=True)
    summary_detailed = db.Column(db.Text, nullable=True)
    score = db.Column(db.Integer, nullable=True)
    timestamp = db.Column(db.String(80), nullable=True)
    alert = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # operational fields for CTI workflow
    status = db.Column(db.String(20), default="new")  # new, acknowledged, mitigated, resolved
    acknowledged_at = db.Column(db.DateTime, nullable=True)
    mitigated_at = db.Column(db.DateTime, nullable=True)
    mitigated_by = db.Column(db.String(100), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "indicator": self.indicator,
            "type": self.type,
            "description": self.description,
            "summary": self.summary,
            "summary_short": self.summary_short,
            "summary_detailed": self.summary_detailed,
            "score": self.score,
            "timestamp": self.timestamp,
            "alert": bool(self.alert),
            "status": self.status,
            "acknowledged_at": getattr(self.acknowledged_at, 'isoformat', lambda: None)(),
            "mitigated_at": getattr(self.mitigated_at, 'isoformat', lambda: None)(),
            "mitigated_by": self.mitigated_by,
        }

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


# ---------------- Real-time / SSE support ----------------
# Simple server-sent events (SSE) broadcaster using per-client queues
clients = []  # list of queue.Queue()

def broadcast_event(event_name, payload):
    """Put an event into each connected client's queue."""
    msg = {
        "event": event_name,
        "data": payload,
        "ts": datetime.utcnow().isoformat() + "Z"
    }
    text = f"event: {event_name}\ndata: {json.dumps(payload)}\n\n"
    for q in list(clients):
        try:
            q.put(text, block=False)
        except Exception:
            # if put fails, remove the client
            try:
                clients.remove(q)
            except Exception:
                pass


@app.route('/api/threats/stream')
def stream_threats():
    """SSE endpoint — clients connect and receive new threat events in real time."""
    def gen(q):
        try:
            # send a ping once on connect
            yield f"event: ping\ndata: connected\n\n"
            while True:
                try:
                    msg = q.get(timeout=30)
                    yield msg
                except queue.Empty:
                    # keep connection alive with a comment/ping
                    yield ': keep-alive\n\n'
        finally:
            # remove client when generator is closed
            try:
                clients.remove(q)
            except Exception:
                pass

    q = queue.Queue()
    clients.append(q)
    return Response(gen(q), mimetype='text/event-stream')

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
@cross_origin(origins=[
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001"
])  # explicit dev origins
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

        # Iterate pulses and indicators, generate summaries/scores and persist to DB
        for pulse in data.get("results", [])[:3]:
            pulse_title = pulse.get("name", "Unknown Threat")
            for i in pulse.get("indicators", [])[:5]:
                indicator_value = i.get("indicator", "N/A")
                indicator_type = i.get("type", "N/A")
                timestamp = pulse.get("created", "N/A")

                # Generate summaries (short + detailed) and score (AI fallback handled inside functions)
                try:
                    summary_short = summarize_threat(i, pulse_title=pulse_title, detail="short")
                    summary_detailed = summarize_threat(i, pulse_title=pulse_title, detail="detailed")
                    score = score_threat(indicator_value, pulse_title)
                except Exception as e:
                    print(f"AI error for {indicator_value}: {e}")
                    summary_short = "Summary unavailable"
                    summary_detailed = "Summary unavailable"
                    score = 0

                alert_flag = score >= NOTIFY_THRESHOLD

                # Build dictionary for response
                threat_info = {
                    "title": pulse_title,
                    "indicator": indicator_value,
                    "type": indicator_type,
                    "summary": summary_short,
                    "score": score,
                    "timestamp": timestamp,
                    "alert": alert_flag
                }

                # Persist or update the threat in the DB so summaries survive refreshes
                try:
                    existing = None
                    try:
                        existing = Threat.query.filter_by(indicator=indicator_value, title=pulse_title).first()
                    except Exception:
                        # If the Threat table doesn't exist yet (migrations not run), skip persistence
                        existing = None

                    if existing:
                        existing.type = indicator_type
                        existing.description = i.get("description") if isinstance(i, dict) else None
                        existing.summary = summary_short
                        existing.summary_short = summary_short
                        existing.summary_detailed = summary_detailed
                        existing.score = score
                        existing.timestamp = timestamp
                        existing.alert = alert_flag
                        db.session.add(existing)
                    else:
                        new_threat = Threat(
                            title=pulse_title,
                            indicator=indicator_value,
                            type=indicator_type,
                            description=i.get("description") if isinstance(i, dict) else None,
                            summary=summary_short,
                            summary_short=summary_short,
                            summary_detailed=summary_detailed,
                            score=score,
                            timestamp=timestamp,
                            alert=alert_flag
                        )
                        db.session.add(new_threat)
                except Exception as e:
                    # Don't fail the whole response because persistence failed; log and continue
                    print(f"Warning: failed to persist threat {indicator_value}: {e}")
                threats.append(threat_info)

                # broadcast the new/updated threat to any connected real-time clients
                try:
                    broadcast_event('threat:update', threat_info)
                except Exception as _:
                    pass

        # Try to commit any DB changes (if any)
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"Warning: failed to commit threat changes: {e}")

        return jsonify(threats)
    except Exception as e:
        print(f"Unexpected error in /api/threats: {e}")
        return jsonify({"error": "Internal server error"}), 500

# --- New Endpoint: Manual Email Notification (Admin Only) ---
@app.route("/api/send-notification", methods=["POST", "OPTIONS"])
@cross_origin(origins=[
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001"
], methods=["POST", "OPTIONS"])
@token_required
def send_notification(current_user):
    try:
        if current_user.role != "admin":
            return jsonify({"error": "Unauthorized"}), 403

        data = request.get_json(silent=True) or {}
        threat = data.get("threat")  # Expect the full threat object
        user_email = data.get("user_email")  # Target user's email

        if not threat and not data.get('send_to_all'):
            return jsonify({"error": "Missing threat or target"}), 400

        # Build the email content from the threat data (used for single-user fallback)
        subject = f"🚨 High-Risk Threat Detected: {threat.get('title', 'Unknown') if isinstance(threat, dict) else 'Threat'}"

        # If frontend requested sending to all users, iterate and send
        send_to_all = False
        if isinstance(user_email, str) and user_email.upper() == 'ALL':
            send_to_all = True
        if data.get('send_to_all'):
            send_to_all = True

        if send_to_all:
            users = User.query.all()
            # Use persisted threats from DB; fall back to provided threat if DB is empty
            try:
                persisted_threats = Threat.query.order_by(Threat.created_at.desc()).all()
            except Exception as e:
                print(f"Warning: could not read persisted threats (possible missing columns): {e}")
                persisted_threats = []
            if not persisted_threats and threat:
                persisted_threats = [threat]

            successes = 0
            failures = 0
            for u in users:
                try:
                    # Build per-user body using subscription preference
                    per_user_subject = f"🚨 Threat Update — {len(persisted_threats)} items"
                    lines = [f"Hello {u.username},\n\nYou are receiving the latest threat dashboard summary:\n"]

                    for t in persisted_threats:
                        # t may be a Threat model or a dict
                        if hasattr(t, 'summary_short'):
                            short = t.summary_short or t.summary or "Summary unavailable"
                            detailed = t.summary_detailed or short
                            title = t.title
                            indicator_v = t.indicator
                            score_v = t.score
                            timestamp_v = t.timestamp
                        else:
                            # dict case (incoming payload)
                            title = t.get('title', 'Unknown')
                            indicator_v = t.get('indicator', 'N/A')
                            score_v = t.get('score', 'N/A')
                            timestamp_v = t.get('timestamp', 'N/A')
                            # generate or use provided summary
                            short = t.get('summary') or "Summary unavailable"
                            detailed = short

                        # Choose summary based on subscription
                        if getattr(u, 'subscribed', False):
                            # try to use cached detailed summary; if missing, generate and persist
                            chosen = detailed
                            if not chosen or chosen == "Summary unavailable":
                                try:
                                    indicator_obj = {"indicator": indicator_v, "type": getattr(t, 'type', 'Unknown'), "description": getattr(t, 'description', '')}
                                    chosen = summarize_threat(indicator_obj, pulse_title=title, detail="detailed")
                                    if hasattr(t, 'id'):
                                        t.summary_detailed = chosen
                                        db.session.add(t)
                                except Exception:
                                    chosen = detailed or short
                        else:
                            chosen = short
                            if not chosen or chosen == "Summary unavailable":
                                try:
                                    indicator_obj = {"indicator": indicator_v, "type": getattr(t, 'type', 'Unknown'), "description": getattr(t, 'description', '')}
                                    chosen = summarize_threat(indicator_obj, pulse_title=title, detail="short")
                                    if hasattr(t, 'id'):
                                        t.summary_short = chosen
                                        db.session.add(t)
                                except Exception:
                                    chosen = short

                        lines.append(f"Title: {title}\nIndicator: {indicator_v}\nScore: {score_v}\nSummary: {chosen}\nTimestamp: {timestamp_v}\n---\n")

                    # attempt to commit any new cached summaries
                    try:
                        db.session.commit()
                    except Exception:
                        db.session.rollback()

                    body_for_user = "\n".join(lines) + "\n— Threat Intelligence System"
                    ok = send_email_notification(u.email, per_user_subject, body_for_user)
                    if ok:
                        successes += 1
                    else:
                        failures += 1
                except Exception as e:
                    print(f"Error sending to {u.email}: {e}")
                    failures += 1
            return jsonify({"message": "Batch send complete", "sent": successes, "failed": failures}), 200

        # Otherwise send to a single user (use per-user subscription to control summary length)
        target_user = User.query.filter_by(email=user_email).first() if isinstance(user_email, str) else None
        is_subscribed = bool(getattr(target_user, 'subscribed', False))

        # If the threat is a persisted Threat (id provided) try to load it
        chosen_summary = None
        if isinstance(threat, dict) and 'indicator' in threat:
            try:
                persisted = Threat.query.filter_by(indicator=threat.get('indicator'), title=threat.get('title')).first()
            except Exception as e:
                print(f"Warning: could not query persisted threat (possible missing columns): {e}")
                persisted = None
            if persisted:
                if is_subscribed:
                    chosen_summary = persisted.summary_detailed or persisted.summary_short or persisted.summary
                else:
                    chosen_summary = persisted.summary_short or persisted.summary
            else:
                try:
                    detail = 'detailed' if is_subscribed else 'short'
                    chosen_summary = summarize_threat(threat, pulse_title=threat.get('title', ''), detail=detail)
                except Exception:
                    chosen_summary = threat.get('summary', 'Summary unavailable')
        else:
            chosen_summary = threat.get('summary', 'Summary unavailable') if isinstance(threat, dict) else 'Summary unavailable'

        # Build personalized email
        personalized_subject = subject
        personalized_body = f"\nHello {getattr(target_user, 'username', 'User')},\n\n"
        personalized_body += f"A threat notification has been sent:\n\n📛 Title: {threat.get('title', 'N/A')}\n🔍 Indicator: {threat.get('indicator', 'N/A')}\n📈 Score: {threat.get('score', 'N/A')}\n📝 Summary: {chosen_summary}\n🕒 Timestamp: {threat.get('timestamp', 'N/A')}\n\n— Threat Intelligence System\n"

        if send_email_notification(user_email, personalized_subject, personalized_body):
            return jsonify({"message": "Notification sent successfully", "sent": 1, "failed": 0}), 200
        else:
            # Don't return a hard 500 for delivery failure — return a 200 with failure details
            return jsonify({"message": "Failed to send notification (delivery error)", "sent": 0, "failed": 1}), 200
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(tb)
        # Persist error details to a file to aid debugging in local dev
        try:
            with open('send_notification_error.log', 'a', encoding='utf-8') as f:
                f.write('\n--- /api/send-notification error ---\n')
                try:
                    f.write('Headers:\n' + str(dict(request.headers)) + '\n')
                except Exception:
                    f.write('Could not read headers\n')
                try:
                    f.write('Body:\n' + (request.get_data(as_text=True) or '') + '\n')
                except Exception:
                    f.write('Could not read body\n')
                f.write('Traceback:\n')
                f.write(tb + '\n')
        except Exception as _write_err:
            print('Failed to write send_notification_error.log:', _write_err)

        # Return a little more info in development so the frontend can show a helpful message
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


# ---------------- Admin actions on threats ----------------
@app.route('/api/threats/<int:threat_id>/acknowledge', methods=['POST'])
@token_required
def acknowledge_threat(current_user, threat_id):
    if current_user.role != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    t = Threat.query.get(threat_id)
    if not t:
        return jsonify({'error': 'Threat not found'}), 404
    t.status = 'acknowledged'
    t.acknowledged_at = datetime.utcnow()
    db.session.add(t)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to update threat', 'details': str(e)}), 500
    # broadcast the change
    broadcast_event('threat:acknowledged', t.to_dict())
    return jsonify({'message': 'Threat acknowledged', 'threat': t.to_dict()}), 200


@app.route('/api/threats/<int:threat_id>/mitigate', methods=['POST'])
@token_required
def mitigate_threat(current_user, threat_id):
    if current_user.role != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.get_json(silent=True) or {}
    t = Threat.query.get(threat_id)
    if not t:
        return jsonify({'error': 'Threat not found'}), 404
    t.status = 'mitigated'
    t.mitigated_at = datetime.utcnow()
    t.mitigated_by = data.get('by', getattr(current_user, 'username', 'admin'))
    db.session.add(t)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to update threat', 'details': str(e)}), 500
    broadcast_event('threat:mitigated', t.to_dict())
    return jsonify({'message': 'Threat mitigated', 'threat': t.to_dict()}), 200

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
                # user table subscribed column
                try:
                    cols = [c['name'] for c in inspector.get_columns('user')]
                    if 'subscribed' not in cols:
                            # add column for sqlite using SQLAlchemy 2.x compatible API
                            try:
                                with db.engine.begin() as conn:
                                    conn.execute(text('ALTER TABLE user ADD COLUMN subscribed BOOLEAN DEFAULT 0'))
                                print('Added subscribed column to user table')
                            except Exception as _e:
                                print('Failed to add subscribed column via ALTER TABLE:', _e)
                except Exception:
                    pass

                # threat table: ensure newly added summary columns exist (sqlite ALTER TABLE ADD COLUMN is supported)
                try:
                    if 'threat' in inspector.get_table_names():
                        threat_cols = [c['name'] for c in inspector.get_columns('threat')]
                        if 'summary_short' not in threat_cols:
                            try:
                                with db.engine.begin() as conn:
                                    conn.execute(text("ALTER TABLE threat ADD COLUMN summary_short TEXT"))
                                print('Added summary_short column to threat table')
                            except Exception as _e:
                                print('Failed to add summary_short column via ALTER TABLE:', _e)
                        if 'summary_detailed' not in threat_cols:
                            try:
                                with db.engine.begin() as conn:
                                    conn.execute(text("ALTER TABLE threat ADD COLUMN summary_detailed TEXT"))
                                print('Added summary_detailed column to threat table')
                            except Exception as _e:
                                print('Failed to add summary_detailed column via ALTER TABLE:', _e)
                        if 'summary' not in threat_cols:
                            try:
                                with db.engine.begin() as conn:
                                    conn.execute(text("ALTER TABLE threat ADD COLUMN summary TEXT"))
                                print('Added summary column to threat table')
                            except Exception as _e:
                                print('Failed to add summary column via ALTER TABLE:', _e)
                except Exception:
                    pass
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