const DEFAULT_TARGET = 75;
const STATUSES = ['present', 'absent', 'leave'];

const buttons = document.querySelectorAll('.tab-button');
const pages = document.querySelectorAll('.page');
const messageBox = document.getElementById('messageBox');

const targetInput = document.getElementById('targetInput');
const summarySubjects = document.getElementById('summarySubjects');
const summaryOverall = document.getElementById('summaryOverall');
const summaryConducted = document.getElementById('summaryConducted');
const summaryAttended = document.getElementById('summaryAttended');
const subjectCards = document.getElementById('subjectCards');
const noSubjectsText = document.getElementById('noSubjectsText');

const subjectForm = document.getElementById('subjectForm');
const subjectName = document.getElementById('subjectName');
const subjectCode = document.getElementById('subjectCode');
const subjectList = document.getElementById('subjectList');
const noSubjectListText = document.getElementById('noSubjectListText');

const attendanceDate = document.getElementById('attendanceDate');
const attendanceRows = document.getElementById('attendanceRows');
const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');

const historySubject = document.getElementById('historySubject');
const historyRows = document.getElementById('historyRows');

function escapeHtml(text) {
  if (text === null || text === undefined) {
    return '';
  }
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatPercentage(value) {
  if (value === null) {
    return 'N/A';
  }
  return value.toFixed(2) + '%';
}

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function showMessage(text, type) {
  messageBox.textContent = text;
  messageBox.className = 'message ' + type;
}

function clearMessage() {
  messageBox.textContent = '';
  messageBox.className = 'message hidden';
}

async function sendRequest(url, method, body) {
  const options = { method: method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }
  return data;
}

function showPage(pageId) {
  for (let i = 0; i < pages.length; i++) {
    pages[i].classList.toggle('hidden', pages[i].id !== pageId);
  }
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].dataset.page === pageId);
  }
  clearMessage();

  if (pageId === 'dashboardPage') {
    loadDashboard();
  } else if (pageId === 'subjectsPage') {
    loadSubjects();
  } else if (pageId === 'markPage') {
    loadMarkPage();
  } else if (pageId === 'historyPage') {
    loadHistoryPage();
  }
}

function getTarget() {
  const value = parseInt(targetInput.value, 10);
  if (isNaN(value) || value < 1 || value > 100) {
    return null;
  }
  return value;
}

async function loadDashboard() {
  const target = getTarget();
  if (target === null) {
    showMessage('Target must be a whole number from 1 to 100.', 'error');
    return;
  }
  localStorage.setItem('attendanceTarget', String(target));

  try {
    const data = await sendRequest('/api/subjects?target=' + target, 'GET');
    renderDashboard(data);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function renderDashboard(data) {
  summarySubjects.textContent = data.summary.total_subjects;
  summaryAttended.textContent = data.summary.total_attended;
  summaryConducted.textContent = data.summary.total_conducted;
  summaryOverall.textContent = formatPercentage(data.summary.overall_percentage);

  noSubjectsText.classList.toggle('hidden', data.subjects.length > 0);
  let cards = '';
  for (let i = 0; i < data.subjects.length; i++) {
    cards += renderSubjectCard(data.subjects[i]);
  }
  subjectCards.innerHTML = cards;
}

function renderSubjectCard(subject) {
  let code = '';
  if (subject.code) {
    code = '<span class="subject-code">' + escapeHtml(subject.code) + '</span>';
  }

  return '<article class="subject-card state-' + subject.state + '">' +
    '<div class="subject-card-header">' +
      '<h3>' + escapeHtml(subject.name) + '</h3>' +
      code +
    '</div>' +
    '<p class="subject-percentage">' + formatPercentage(subject.percentage) + '</p>' +
    '<p class="subject-counts">Attended ' + subject.attended + ' of ' + subject.conducted + ' conducted classes</p>' +
    '<p class="subject-message">' + escapeHtml(subject.message) + '</p>' +
  '</article>';
}

async function loadSubjects() {
  try {
    const data = await sendRequest('/api/subjects', 'GET');
    renderSubjectList(data.subjects);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function renderSubjectList(subjects) {
  noSubjectListText.classList.toggle('hidden', subjects.length > 0);

  let items = '';
  for (let i = 0; i < subjects.length; i++) {
    const subject = subjects[i];
    let code = '';
    if (subject.code) {
      code = '<span class="subject-code">' + escapeHtml(subject.code) + '</span>';
    }

    items += '<li class="list-item">' +
      '<div><strong>' + escapeHtml(subject.name) + '</strong>' + code + '</div>' +
      '<button class="btn btn-danger delete-button" data-subject-id="' + subject.id + '" data-subject-name="' + escapeHtml(subject.name) + '">Delete</button>' +
    '</li>';
  }
  subjectList.innerHTML = items;
}

async function deleteSubject(id, name) {
  const confirmed = confirm('Delete "' + name + '" and all of its attendance records? This cannot be undone.');
  if (!confirmed) {
    return;
  }

  try {
    const data = await sendRequest('/api/subjects/' + id, 'DELETE');
    showMessage(data.message, 'success');
    loadSubjects();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

subjectForm.addEventListener('submit', async function (event) {
  event.preventDefault();
  clearMessage();

  const name = subjectName.value.trim();
  const code = subjectCode.value.trim();

  if (name === '') {
    showMessage('Subject name cannot be empty.', 'error');
    return;
  }

  try {
    const data = await sendRequest('/api/subjects', 'POST', { name: name, code: code });
    showMessage(data.message, 'success');
    subjectForm.reset();
    loadSubjects();
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

subjectList.addEventListener('click', function (event) {
  if (event.target.matches('.delete-button')) {
    deleteSubject(event.target.dataset.subjectId, event.target.dataset.subjectName);
  }
});

async function loadMarkPage() {
  if (attendanceDate.value === '') {
    attendanceDate.value = getToday();
  }
  await loadDayAttendance();
}

async function loadDayAttendance() {
  try {
    const url = '/api/attendance/day?date=' + encodeURIComponent(attendanceDate.value);
    const data = await sendRequest(url, 'GET');
    renderAttendanceRows(data.subjects);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function renderAttendanceRows(subjects) {
  if (subjects.length === 0) {
    attendanceRows.innerHTML = '<tr><td colspan="3" class="empty-cell">Add subjects first on the Subjects page.</td></tr>';
    saveAttendanceBtn.disabled = true;
    return;
  }

  saveAttendanceBtn.disabled = false;
  let rows = '';
  for (let i = 0; i < subjects.length; i++) {
    rows += renderAttendanceRow(subjects[i]);
  }
  attendanceRows.innerHTML = rows;
}

function renderAttendanceRow(subject) {
  const groupName = 'status-' + subject.id;

  let code = '';
  if (subject.code) {
    code = '<span class="subject-code">' + escapeHtml(subject.code) + '</span>';
  }

  let choices = '';
  for (let i = 0; i < STATUSES.length; i++) {
    const status = STATUSES[i];
    let checked = '';
    if (subject.status === status) {
      checked = 'checked';
    }
    choices += '<label class="choice"><input type="radio" name="' + groupName + '" value="' + status + '" ' + checked + '> ' + capitalize(status) + '</label>';
  }

  let savedText = 'Not marked';
  if (subject.status) {
    savedText = capitalize(subject.status);
  }

  return '<tr data-subject-id="' + subject.id + '">' +
    '<td>' + escapeHtml(subject.name) + ' ' + code + '</td>' +
    '<td>' + choices + '</td>' +
    '<td>' + savedText + '</td>' +
  '</tr>';
}

async function saveAttendance() {
  clearMessage();

  const records = [];
  const rows = attendanceRows.querySelectorAll('tr[data-subject-id]');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const choice = row.querySelector('input[type="radio"]:checked');
    if (choice) {
      records.push({
        subject_id: parseInt(row.dataset.subjectId, 10),
        status: choice.value
      });
    }
  }

  if (records.length === 0) {
    showMessage('Choose Present, Absent or Leave for at least one subject before saving.', 'error');
    return;
  }

  try {
    const data = await sendRequest('/api/attendance/day', 'POST', {
      date: attendanceDate.value,
      records: records
    });
    showMessage(data.message, 'success');
    loadDayAttendance();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

attendanceDate.addEventListener('change', function () {
  clearMessage();
  loadDayAttendance();
});

saveAttendanceBtn.addEventListener('click', saveAttendance);

async function loadHistoryPage() {
  try {
    const data = await sendRequest('/api/subjects', 'GET');
    const previousChoice = historySubject.value;

    let options = '<option value="">Choose a subject</option>';
    for (let i = 0; i < data.subjects.length; i++) {
      const subject = data.subjects[i];
      options += '<option value="' + subject.id + '">' + escapeHtml(subject.name) + '</option>';
    }
    historySubject.innerHTML = options;
    historySubject.value = previousChoice;

    await loadHistoryRecords();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function loadHistoryRecords() {
  if (historySubject.value === '') {
    historyRows.innerHTML = '<tr><td colspan="2" class="empty-cell">Choose a subject to see its records.</td></tr>';
    return;
  }

  try {
    const url = '/api/attendance/history?subject_id=' + historySubject.value;
    const data = await sendRequest(url, 'GET');

    if (data.records.length === 0) {
      historyRows.innerHTML = '<tr><td colspan="2" class="empty-cell">No attendance records yet for this subject.</td></tr>';
      return;
    }

    let rows = '';
    for (let i = 0; i < data.records.length; i++) {
      rows += renderHistoryRow(data.records[i]);
    }
    historyRows.innerHTML = rows;
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function renderHistoryRow(record) {
  let options = '';
  for (let i = 0; i < STATUSES.length; i++) {
    const status = STATUSES[i];
    let selected = '';
    if (record.status === status) {
      selected = 'selected';
    }
    options += '<option value="' + status + '" ' + selected + '>' + capitalize(status) + '</option>';
  }

  return '<tr>' +
    '<td>' + escapeHtml(record.date) + '</td>' +
    '<td><select class="history-status" data-date="' + escapeHtml(record.date) + '">' + options + '</select></td>' +
  '</tr>';
}

historySubject.addEventListener('change', function () {
  clearMessage();
  loadHistoryRecords();
});

historyRows.addEventListener('change', async function (event) {
  if (!event.target.matches('.history-status')) {
    return;
  }

  clearMessage();
  try {
    const data = await sendRequest('/api/attendance/day', 'POST', {
      date: event.target.dataset.date,
      records: [{
        subject_id: parseInt(historySubject.value, 10),
        status: event.target.value
      }]
    });
    showMessage(data.message, 'success');
  } catch (error) {
    showMessage(error.message, 'error');
    loadHistoryRecords();
  }
});

for (let i = 0; i < buttons.length; i++) {
  const button = buttons[i];
  button.addEventListener('click', function () {
    showPage(button.dataset.page);
  });
}

targetInput.value = localStorage.getItem('attendanceTarget') || String(DEFAULT_TARGET);
targetInput.addEventListener('change', loadDashboard);

showPage('dashboardPage');
