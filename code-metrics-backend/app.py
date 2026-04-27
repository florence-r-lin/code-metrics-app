import sys
import os
import tempfile
import shutil
import zipfile
import json
import datetime

# Database
from sqlalchemy import create_engine, Column, String, Date, Time, Text, Integer, Float
from sqlalchemy.orm import declarative_base, sessionmaker

# Workaround for bare imports in Code-Heuristics package
import Metrics as _metrics_pkg
sys.path.insert(0, os.path.dirname(_metrics_pkg.__file__))

from applyMetrics import metricsOnFilepath

from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import time

app = Flask(__name__)
CORS(app)
from db import engine, SessionLocal, Base, User, UserFile, FileStat, save_metrics_for_email

# Auth config
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXP_SECONDS = int(os.environ.get("JWT_EXP_SECONDS", "3600"))


def create_token(email: str):
    now = int(time.time())
    payload = {"sub": email, "iat": now, "exp": now + JWT_EXP_SECONDS}
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def is_valid_email(e: str) -> bool:
    if not e or not isinstance(e, str):
        return False
    import re
    return re.match(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$", e) is not None


@app.route("/auth/register", methods=["POST"])
def auth_register():
    data = request.get_json(force=True)
    name = data.get("name")
    email = data.get("email")
    password = data.get("password")

    if not name or not email or not password:
        return jsonify({"error": "name, email and password are required"}), 400
    if not is_valid_email(email):
        return jsonify({"error": "invalid email"}), 400

    session = SessionLocal() if SessionLocal is not None else None
    try:
        if session is None:
            return jsonify({"error": "DB not configured"}), 500
        existing = session.get(User, email)
        if existing:
            return jsonify({"error": "user already exists"}), 400

        hashed = generate_password_hash(password)
        user = User(email=email, name=name, password=hashed)
        session.add(user)
        session.commit()

        token = create_token(email)
        return jsonify({"user": {"email": email, "name": name}, "token": token})
    except Exception as e:
        if session:
            session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()


@app.route("/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json(force=True)
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "email and password required"}), 400
    if not is_valid_email(email):
        return jsonify({"error": "invalid email"}), 400

    session = SessionLocal() if SessionLocal is not None else None
    try:
        if session is None:
            return jsonify({"error": "DB not configured"}), 500
        user = session.get(User, email)
        if not user:
            return jsonify({"error": "invalid credentials"}), 401
        if not check_password_hash(user.password, password):
            return jsonify({"error": "invalid credentials"}), 401

        token = create_token(email)
        return jsonify({"user": {"email": user.email, "name": user.name}, "token": token})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()


# --------------------------------------------------------------------


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

        # Optional: determine email from Authorization header or `email` form field, then save metrics to DB
        email = None
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1]
            try:
                payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
                email = payload.get('sub')
            except Exception:
                email = None
        if not email:
            email = request.form.get("email")
        if email and engine is not None:
            try:
                save_metrics_for_email(email, files)
            except Exception as e:
                # Log or surface DB save issues but don't break analysis response
                print("DB save error:", e)

        return jsonify({"files": files, "averages": averages})

    except zipfile.BadZipFile:
        return jsonify({"error": "Invalid or corrupted zip file"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    app.run(debug=True, port=5001)
