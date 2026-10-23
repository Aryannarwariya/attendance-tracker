# College Attendance Tracker

A simple web app to track college attendance. Add your subjects once, mark your attendance for each day, and see your attendance percentage update automatically. All data is saved in a local SQLite database, so it is still there after you close and reopen the app.

## Features

- **Dashboard**: total subjects, overall attendance, total classes conducted and attended, and a card for each subject.
- **Subjects**: add a subject with a name and an optional code, view all subjects, and delete a subject after confirmation.
- **Mark Attendance**: pick a date, mark each subject as Present, Absent or Leave, and save. Saving again for the same date updates the existing record.
- **History**: pick a subject, see its records by date, and correct any record.
- **Target attendance**: set a target percentage (default 75%). The app shows whether you are above or below it and how many classes in a row you need to attend to reach it.

## Technologies Used

- **HTML** for the page structure (one page, with sections shown or hidden by JavaScript)
- **CSS** for styling
- **Vanilla JavaScript** for button clicks and talking to the server with `fetch`
- **Python** with **Flask** for the backend and JSON API
- **SQLite** (through Python's built-in `sqlite3` module) for permanent storage

## Project Structure

```
attendance-tracker/
    app.py              Flask routes and attendance calculations
    database.py         SQLite connection, table creation and query helpers
    requirements.txt    Python dependencies (Flask only)
    templates/
        index.html      The page layout
    static/
        style.css       Styling
        script.js       Frontend behaviour
    .gitignore          Files Git should ignore
    README.md           This file
```

The database file `attendance.db` is created automatically in the project folder the first time the app starts.

## Installation

You need Python 3.10 or newer.

```bash
cd attendance-tracker
python -m venv venv
source venv/bin/activate      # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Running the Application

```bash
python app.py
```

Then open <http://127.0.0.1:5000> in your browser. Press `Ctrl + C` in the terminal to stop the server.

## How Attendance Is Calculated

For each subject:

- **Classes attended** = number of Present records
- **Classes conducted** = number of Present records + number of Absent records
- **Leave records are ignored** in both numbers.

Attendance percentage:

```
Attendance % = (Present / (Present + Absent)) × 100
```

If a subject has no Present or Absent records yet, the percentage is shown as **N/A**.

Overall attendance is calculated from the totals across all subjects, not by averaging subject percentages:

```
Overall % = (Total attended / Total conducted) × 100
```

### Classes needed to reach the target

If the percentage is below the target, the app calculates how many classes in a row you must attend:

```
x = ceil((target × conducted − attended) / (1 − target))
```

Here `target` is written as a fraction (for example 0.75 for 75%). The app uses whole-number arithmetic internally so the result is exact.

A target of 100% is handled separately. Once you have missed even one class, 100% can never be reached again, so the app says so instead of showing a number.

**Example:** Target 75%, attended 6 out of 10 conducted.
- Current percentage: 6 / 10 × 100 = 60%, which is below 75%.
- x = ceil((0.75 × 10 − 6) / (1 − 0.75)) = ceil(1.5 / 0.25) = ceil(6) = 6
- You need to attend the next 6 classes in a row. After that you would have 12 out of 16, which is exactly 75%.

## API Overview

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/` | Shows the page |
| GET | `/api/subjects?target=75` | Subjects with their totals, percentages and summary |
| POST | `/api/subjects` | Add a subject (`name`, optional `code`) |
| DELETE | `/api/subjects/<id>` | Delete a subject and its records |
| GET | `/api/attendance/day?date=YYYY-MM-DD` | Subjects with their status on that date |
| POST | `/api/attendance/day` | Save or update records for a date |
| GET | `/api/attendance/history?subject_id=<id>` | All records for one subject |

## Known Limitations

- There is no login. The app is meant for one person on their own computer.
- The target percentage is saved in the browser (localStorage), not on the server. It must be whole numbers from 1 to 100.
- Each subject can have only one record per date. You can change a record to another status, but you cannot remove a record once it is saved.
- Subject names must be unique (ignoring upper and lower case), and so must subject codes.
- Dates are not checked against your college calendar, so you can mark attendance for any date.
- The app does not run with Flask's debug mode, so errors are shown as friendly messages instead of tracebacks.

## Possible Future Improvements

- Let the user clear a record for a date.
- Store the target percentage on the server.
- Show how many classes can be missed while staying above the target.
- Add per-subject monthly summaries and a semester start and end date.
- Export attendance to CSV.
