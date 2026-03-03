import sys
import os
import tempfile
import shutil
import zipfile

# Workaround for bare imports in Code-Heuristics package
import Metrics as _metrics_pkg
sys.path.insert(0, os.path.dirname(_metrics_pkg.__file__))

from applyMetrics import metricsOnFilepath

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)


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
