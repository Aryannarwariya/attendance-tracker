import datetime
import math
import sqlite3

from flask import Flask, jsonify, render_template, request

from database import fetch_all, fetch_one, init_database, run_in_transaction


app = Flask(__name__)

DEFAULT_TARGET = 75
MAX_NAME_LENGTH = 100
MAX_CODE_LENGTH = 20
VALID_STATUSES = ("present", "absent", "leave")

SUBJECTS_SQL = """
    SELECT subjects.id, subjects.name, subjects.code,
           COALESCE(SUM(CASE WHEN attendance.status = 'present' THEN 1 ELSE 0 END), 0) AS attended,
           COALESCE(SUM(CASE WHEN attendance.status IN ('present', 'absent') THEN 1 ELSE 0 END), 0) AS conducted
    FROM subjects
    LEFT JOIN attendance ON attendance.subject_id = subjects.id
    GROUP BY subjects.id
    ORDER BY subjects.name COLLATE NOCASE
"""

DAY_SQL = """
    SELECT subjects.id, subjects.name, subjects.code, attendance.status
    FROM subjects
    LEFT JOIN attendance
           ON attendance.subject_id = subjects.id AND attendance.date = ?
    ORDER BY subjects.name COLLATE NOCASE
"""

SAVE_SQL = """
    INSERT INTO attendance (subject_id, date, status)
    VALUES (?, ?, ?)
    ON CONFLICT (subject_id, date) DO UPDATE SET status = excluded.status
"""


def error_response(message, status_code):
    return jsonify({"error": message}), status_code


def get_text(data, key):
    value = data.get(key, "")
    if not isinstance(value, str):
        return None
    return value.strip()


def get_date(text):
    try:
        return datetime.date.fromisoformat(text).isoformat()
    except (TypeError, ValueError):
        return None


def get_target(text):
    try:
        target = int(text)
    except (TypeError, ValueError):
        return None
    if target < 1 or target > 100:
        return None
    return target


def get_attendance(attended, conducted, target):
    if conducted == 0:
        return {
            "percentage": None,
            "state": "none",
            "message": "No classes conducted yet.",
        }

    percentage = round(attended * 100 / conducted, 2)

    if attended * 100 >= target * conducted:
        return {
            "percentage": percentage,
            "state": "above",
            "message": f"Above target. You are on track for {target}%.",
        }

    if target == 100:
        return {
            "percentage": percentage,
            "state": "impossible",
            "message": "A 100% target can no longer be reached because some classes were missed.",
        }

    top = target * conducted - 100 * attended
    bottom = 100 - target
    needed = math.ceil(top / bottom)
    return {
        "percentage": percentage,
        "state": "below",
        "classes_needed": needed,
        "message": f"Below target. Attend the next {needed} class(es) in a row to reach {target}%.",
    }


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/subjects", methods=["GET"])
def get_subjects():
    target = get_target(request.args.get("target", DEFAULT_TARGET))
    if target is None:
        return error_response("Target must be a whole number from 1 to 100.", 400)

    subjects = fetch_all(SUBJECTS_SQL)

    total_attended = 0
    total_conducted = 0
    for subject in subjects:
        result = get_attendance(subject["attended"], subject["conducted"], target)
        subject.update(result)
        total_attended += subject["attended"]
        total_conducted += subject["conducted"]

    if total_conducted == 0:
        overall = None
    else:
        overall = round(total_attended * 100 / total_conducted, 2)

    summary = {
        "total_subjects": len(subjects),
        "total_attended": total_attended,
        "total_conducted": total_conducted,
        "overall_percentage": overall,
    }
    return jsonify({"subjects": subjects, "summary": summary})


@app.route("/api/subjects", methods=["POST"])
def add_subject():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("Send the subject details as JSON.", 400)

    name = get_text(data, "name")
    code = get_text(data, "code")
    if name is None or code is None:
        return error_response("Subject name and code must be text.", 400)
    if name == "":
        return error_response("Subject name cannot be empty.", 400)
    if len(name) > MAX_NAME_LENGTH:
        return error_response(f"Subject name must be {MAX_NAME_LENGTH} characters or fewer.", 400)
    if len(code) > MAX_CODE_LENGTH:
        return error_response(f"Subject code must be {MAX_CODE_LENGTH} characters or fewer.", 400)
    if code == "":
        code = None

    if fetch_one("SELECT id FROM subjects WHERE name = ?", (name,)) is not None:
        return error_response("A subject with this name already exists.", 409)
    if code is not None and fetch_one("SELECT id FROM subjects WHERE code = ?", (code,)) is not None:
        return error_response("A subject with this code already exists.", 409)

    try:
        run_in_transaction([("INSERT INTO subjects (name, code) VALUES (?, ?)", (name, code))])
    except sqlite3.IntegrityError:
        return error_response("A subject with this name or code already exists.", 409)

    return jsonify({"message": f'Subject "{name}" was added.'}), 201


@app.route("/api/subjects/<int:subject_id>", methods=["DELETE"])
def delete_subject(subject_id):
    count = run_in_transaction([("DELETE FROM subjects WHERE id = ?", (subject_id,))])
    if count == 0:
        return error_response("Subject not found. It may already have been deleted.", 404)
    return jsonify({"message": "Subject and its attendance records were deleted."})


@app.route("/api/attendance/day", methods=["GET"])
def get_day():
    date = get_date(request.args.get("date", ""))
    if date is None:
        return error_response("Please choose a valid date.", 400)

    subjects = fetch_all(DAY_SQL, (date,))
    return jsonify({"date": date, "subjects": subjects})


@app.route("/api/attendance/day", methods=["POST"])
def save_day():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("Send the attendance details as JSON.", 400)

    date = get_date(data.get("date"))
    if date is None:
        return error_response("Please choose a valid date.", 400)

    records = data.get("records")
    if not isinstance(records, list) or len(records) == 0:
        return error_response("No attendance was selected to save.", 400)

    statements = []
    for record in records:
        if not isinstance(record, dict):
            return error_response("Each attendance record must include a subject and a status.", 400)

        subject_id = record.get("subject_id")
        status = record.get("status")

        if type(subject_id) is not int:
            return error_response("Each attendance record must include a valid subject.", 400)
        if status not in VALID_STATUSES:
            return error_response("Status must be Present, Absent or Leave.", 400)
        if fetch_one("SELECT id FROM subjects WHERE id = ?", (subject_id,)) is None:
            return error_response("One of the selected subjects was not found.", 404)

        statements.append((SAVE_SQL, (subject_id, date, status)))

    run_in_transaction(statements)
    return jsonify({"message": f"Attendance saved for {len(statements)} subject(s) on {date}."})


@app.route("/api/attendance/history", methods=["GET"])
def get_history():
    subject_text = request.args.get("subject_id", "")
    if not subject_text.isdigit():
        return error_response("Please choose a subject.", 400)

    subject_id = int(subject_text)
    if fetch_one("SELECT id FROM subjects WHERE id = ?", (subject_id,)) is None:
        return error_response("Subject not found.", 404)

    records = fetch_all(
        "SELECT date, status FROM attendance WHERE subject_id = ? ORDER BY date DESC",
        (subject_id,),
    )
    return jsonify({"subject_id": subject_id, "records": records})


@app.errorhandler(sqlite3.Error)
def database_error(error):
    app.logger.exception("Database error")
    return error_response("Something went wrong while accessing the data. Please try again.", 500)


init_database()


if __name__ == "__main__":
    app.run(debug=False)
