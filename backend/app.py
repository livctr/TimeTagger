from __future__ import annotations

import csv
import os
import threading
from collections import defaultdict
from pathlib import Path
from typing import List, Dict, Any

from flask import Flask, request, jsonify
from flask_cors import CORS

# ─── Configuration ────────────────────────────────────────────────────
CSV_PATH = Path("annotations.csv")      # change if you want a different location
CSV_HEADER = ["video_path", "fm_item", "times"]
CSV_DELIMITER = ";"                     # per requirements
LOCK = threading.Lock()                 # guards concurrent writes

# ─── App setup ────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})  # relax for local dev

# ─── Helpers ──────────────────────────────────────────────────────────
def write_rows(rows: List[List[str]]) -> None:
    """Append rows to the CSV; create file with header if missing."""
    with LOCK:                     # ensure atomic append in multi‑thread server
        new_file = not CSV_PATH.exists()
        CSV_PATH.parent.mkdir(parents=True, exist_ok=True)

        with CSV_PATH.open("a", newline="") as f:
            writer = csv.writer(f, delimiter=CSV_DELIMITER)
            if new_file:
                writer.writerow(CSV_HEADER)
            writer.writerows(rows)


def format_annotations(payload: Dict[str, Any]) -> List[List[str]]:
    """
    Convert the raw JSON payload into CSV rows.

    Returns: List of [video_path, fm_item, times] rows (semicolon‑less fields).
    """
    video_path: str = payload.get("video_path", "").strip()
    ann: List[Dict[str, Any]] = payload.get("annotations", [])

    # { fm_item -> list[(time, type)] }
    grouped: Dict[str, List[tuple[float, str]]] = defaultdict(list)
    for item in ann:
        fm = (item.get("fmItem") or "").strip()
        tp = item.get("type", "").strip()
        try:
            t = float(item.get("time", 0.0))
        except (TypeError, ValueError):
            continue
        grouped[fm].append((t, tp))

    rows: List[List[str]] = []
    for fm_item, lst in grouped.items():
        # sort by time, then build "type:time"
        lst.sort(key=lambda x: x[0])
        times_str = ",".join(f"{tp}:{t:.2f}" for t, tp in lst)
        rows.append([video_path, fm_item, times_str])

    return rows

# ─── Routes ───────────────────────────────────────────────────────────
@app.route("/api/annotations", methods=["POST"])
def save_annotations():
    if not request.is_json:
        return jsonify({"error": "Expecting JSON"}), 400

    rows = format_annotations(request.get_json(silent=True) or {})
    if not rows:
        return jsonify({"error": "No valid annotations"}), 400

    try:
        write_rows(rows)
    except OSError as e:
        return jsonify({"error": f"Failed to write CSV: {e}"}), 500

    return jsonify({"status": "ok", "rows_written": len(rows)}), 200


# ─── Entrypoint ───────────────────────────────────────────────────────
if __name__ == "__main__":
    # Use `host='0.0.0.0'` for Docker / LAN access if needed
    app.run(debug=True, port=9172)
