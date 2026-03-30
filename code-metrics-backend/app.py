import sys
import os
import tempfile
import shutil
import zipfile
import json
import uuid
import bcrypt

# Workaround for bare imports in Code-Heuristics package
import Metrics as _metrics_pkg
sys.path.insert(0, os.path.dirname(_metrics_pkg.__file__))

from applyMetrics import metricsOnFilepath

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Simple file-backed user store (temporary until NoSQL is configured)
USERS_FILE = os.path.join(os.path.dirname(__file__), 'users.json')

def load_users():
    if not os.path.exists(USERS_FILE):
        return []
    with open(USERS_FILE, 'r', encoding='utf-8') as f:
        try:
            return json.load(f)
        except Exception:
            return []

def save_users(users):
    with open(USERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(users, f, indent=2)

def get_user_by_email(email):
    users = load_users()
    for u in users:
        if u.get('email') == email:
            return u
    return None


@app.route('/auth/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    name = data.get('name') or data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not email or not password or not name:
        return jsonify({'error': 'Missing fields'}), 400

    # Prevent duplicate emails
    if get_user_by_email(email):
        return jsonify({'error': 'Email already registered'}), 400

    # Password coming from client may already be a client-side hash (hex); treat it as a password-equivalent
    password_bytes = password.encode('utf-8')

    # bcrypt the provided password-equivalent
    hashed = bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode('utf-8')

    user = {
        'id': str(uuid.uuid4()),
        'name': name,
        'email': email,
        'password_hash': hashed
    }
    users = load_users()
    users.append(user)
    save_users(users)

    return jsonify({'status': 'ok', 'user': {'id': user['id'], 'name': user['name'], 'email': user['email']}})


@app.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Missing credentials'}), 400

    user = get_user_by_email(email)
    if not user:
        return jsonify({'error': 'Invalid email or password'}), 401

    password_bytes = password.encode('utf-8')
    stored_hash = user.get('password_hash', '').encode('utf-8')

    if not bcrypt.checkpw(password_bytes, stored_hash):
        return jsonify({'error': 'Invalid email or password'}), 401

    # For now return a simple token placeholder (in future use JWT)
    token = str(uuid.uuid4())
    return jsonify({'status': 'ok', 'token': token, 'user': {'id': user['id'], 'name': user['name'], 'email': user['email']}})



@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/analyze", methods=["POST"])
def analyze():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    uploaded = request.files["file"]
    if not uploaded.filename.endswith(".zip"):
        return jsonify({"error": "Only .zip files are supported"}), 400

    tmp_dir = tempfile.mkdtemp()
    try:
        zip_path = os.path.join(tmp_dir, "upload.zip")
        uploaded.save(zip_path)

        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmp_dir)
        os.remove(zip_path)

        raw = metricsOnFilepath(tmp_dir, write_csv=False)

        files = []
        for _year, rows in raw:
            files.extend(rows)

        # Strip the temp dir prefix from file names
        for f in files:
            if f.get("File Name"):
                f["File Name"] = os.path.relpath(f["File Name"], tmp_dir)

        # Compute averages over numeric fields
        numeric_keys = [
            "LOC", "Comment Percentage", "Docstring Percentage", "Blank Percentage",
            "Number Of Functions", "Average Function Length",
            "Number of Loops", "Average Loop Length",
            "CycloComplexity", "Max Depth",
        ]
        averages = {}
        counted = [f for f in files if f.get("LOC", 0) > 0]
        if counted:
            for key in numeric_keys:
                vals = [f[key] for f in counted if f.get(key) is not None]
                averages[key] = round(sum(vals) / len(vals), 2) if vals else 0

        return jsonify({"files": files, "averages": averages})

    except zipfile.BadZipFile:
        return jsonify({"error": "Invalid or corrupted zip file"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    app.run(debug=True, port=5001)
