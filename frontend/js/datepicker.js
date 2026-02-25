/* Custom Date Range Picker — click start, hover range, click end */

// UK Parliamentary recess periods — update each session as dates are announced.
// Source: https://www.parliament.uk/business/news/parliamentary-recess-dates/
const RECESS_PERIODS = [
    // 2023-24 session
    { start: '2023-07-20', end: '2023-09-04', label: 'Summer recess' },
    { start: '2023-09-14', end: '2023-10-16', label: 'Conference recess' },
    { start: '2023-11-09', end: '2023-11-13', label: 'Remembrance recess' },
    { start: '2023-12-19', end: '2024-01-08', label: 'Christmas recess' },
    { start: '2024-02-08', end: '2024-02-19', label: 'February recess' },
    { start: '2024-03-26', end: '2024-04-15', label: 'Easter recess' },
    { start: '2024-05-23', end: '2024-06-03', label: 'Whitsun recess' },
    // 2024-25 session
    { start: '2024-07-30', end: '2024-09-01', label: 'Summer recess' },
    { start: '2024-09-19', end: '2024-10-14', label: 'Conference recess' },
    { start: '2024-11-07', end: '2024-11-11', label: 'Remembrance recess' },
    { start: '2024-12-19', end: '2025-01-06', label: 'Christmas recess' },
    { start: '2025-02-13', end: '2025-02-24', label: 'February recess' },
    { start: '2025-04-11', end: '2025-04-28', label: 'Easter recess' },
    { start: '2025-05-22', end: '2025-06-02', label: 'Whitsun recess' },
    { start: '2025-07-22', end: '2025-09-01', label: 'Summer recess' },
    { start: '2025-09-18', end: '2025-10-13', label: 'Conference recess' },
    // 2025-26 session — verify exact dates at parliament.uk/business/news/parliamentary-recess-dates/
    { start: '2025-12-18', end: '2026-01-05', label: 'Christmas recess' },
    { start: '2026-02-12', end: '2026-02-23', label: 'February recess' },
    { start: '2026-04-02', end: '2026-04-20', label: 'Easter recess' },
    { start: '2026-05-21', end: '2026-06-01', label: 'Whitsun recess' },
];

function getRecessLabel(date) {
    const d = date.getTime();
    for (const period of RECESS_PERIODS) {
        const s = new Date(period.start + 'T00:00:00').getTime();
        const e = new Date(period.end + 'T00:00:00').getTime();
        if (d >= s && d <= e) return period.label;
    }
    return null;
}

function rangeOverlapsRecess(start, end) {
    if (!start || !end) return null;
    const s = start.getTime();
    const e = end.getTime();
    for (const period of RECESS_PERIODS) {
        const ps = new Date(period.start + 'T00:00:00').getTime();
        const pe = new Date(period.end + 'T00:00:00').getTime();
        if (s <= pe && e >= ps) return period.label;
    }
    return null;
}

(function () {
    const wrapper = document.getElementById('datePickerWrapper');
    const display = document.getElementById('datePickerDisplay');
    const dropdown = document.getElementById('calendarDropdown');
    const startInput = document.getElementById('startDate');
    const endInput = document.getElementById('endDate');

    let startDate = null;   // Date object
    let endDate = null;      // Date object
    let hoverDate = null;    // Date object (during selection)
    let selectingEnd = false;
    let viewYear, viewMonth; // currently displayed month

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Default view: current month
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();

    // Set sensible defaults (last 2 days)
    const defaultEnd = new Date(today);
    const defaultStart = new Date(today);
    defaultStart.setDate(defaultStart.getDate() - 2);
    setRange(defaultStart, defaultEnd);

    // Toggle dropdown
    display.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.classList.contains('open')) {
            close();
        } else {
            open();
        }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            close();
        }
    });

    function open() {
        // Show month containing start date or current month
        if (startDate) {
            viewYear = startDate.getFullYear();
            viewMonth = startDate.getMonth();
        }
        dropdown.classList.add('open');
        render();
    }

    function close() {
        dropdown.classList.remove('open');
        selectingEnd = false;
        hoverDate = null;
    }

    function setRange(start, end) {
        startDate = start;
        endDate = end;
        selectingEnd = false;
        hoverDate = null;

        // Update hidden inputs
        if (start) { startInput.value = fmt(start); startInput.dispatchEvent(new Event('change')); }
        else startInput.value = '';
        if (end) { endInput.value = fmt(end); endInput.dispatchEvent(new Event('change')); }
        else endInput.value = '';

        updateDisplay();
    }

    function updateDisplay() {
        if (startDate && endDate) {
            display.textContent = `${fmtDisplay(startDate)} \u2013 ${fmtDisplay(endDate)}`;
            display.classList.remove('placeholder');
        } else if (startDate) {
            display.textContent = `${fmtDisplay(startDate)} \u2013 ...`;
            display.classList.remove('placeholder');
        } else {
            display.textContent = 'Select date range';
            display.classList.add('placeholder');
        }
    }

    function fmt(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
    }

    function fmtDisplay(d) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }

    function sameDay(a, b) {
        if (!a || !b) return false;
        return a.getFullYear() === b.getFullYear() &&
               a.getMonth() === b.getMonth() &&
               a.getDate() === b.getDate();
    }

    function inRange(day, start, end) {
        if (!start || !end) return false;
        return day >= start && day <= end;
    }

    // Store references to day cells for fast hover updates
    let dayCells = []; // { el, date }

    function render() {
        dropdown.innerHTML = '';
        dayCells = [];

        // Header: ‹ Month Year ›
        const header = document.createElement('div');
        header.className = 'calendar-header';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'calendar-nav';
        prevBtn.type = 'button';
        prevBtn.innerHTML = '&#8249;';
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            viewMonth--;
            if (viewMonth < 0) { viewMonth = 11; viewYear--; }
            render();
        });

        const nextBtn = document.createElement('button');
        nextBtn.className = 'calendar-nav';
        nextBtn.type = 'button';
        nextBtn.innerHTML = '&#8250;';
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            viewMonth++;
            if (viewMonth > 11) { viewMonth = 0; viewYear++; }
            render();
        });

        const monthLabel = document.createElement('span');
        monthLabel.className = 'calendar-month-label';
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        monthLabel.textContent = `${monthNames[viewMonth]} ${viewYear}`;

        header.appendChild(prevBtn);
        header.appendChild(monthLabel);
        header.appendChild(nextBtn);
        dropdown.appendChild(header);

        // Day-of-week labels
        const dowRow = document.createElement('div');
        dowRow.className = 'calendar-grid calendar-dow';
        for (const d of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) {
            const cell = document.createElement('div');
            cell.className = 'calendar-dow-cell';
            cell.textContent = d;
            dowRow.appendChild(cell);
        }
        dropdown.appendChild(dowRow);

        // Day grid
        const grid = document.createElement('div');
        grid.className = 'calendar-grid';

        const firstDay = new Date(viewYear, viewMonth, 1);
        let dayOfWeek = firstDay.getDay(); // 0=Sun
        dayOfWeek = (dayOfWeek + 6) % 7;  // Mon=0

        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

        // Previous month padding
        const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
        for (let i = dayOfWeek - 1; i >= 0; i--) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day other-month';
            cell.textContent = prevMonthDays - i;
            grid.appendChild(cell);
        }

        // Current month days
        for (let d = 1; d <= daysInMonth; d++) {
            const cell = document.createElement('div');
            const date = new Date(viewYear, viewMonth, d);
            date.setHours(0, 0, 0, 0);
            cell.textContent = d;

            const isFuture = date > today;

            const recessLabel = getRecessLabel(date);

            if (isFuture) {
                cell.className = 'calendar-day future';
            } else {
                cell.className = 'calendar-day';
                if (recessLabel) {
                    cell.classList.add('recess');
                    cell.title = `Parliamentary recess (${recessLabel})`;
                }
                // Store for hover updates
                dayCells.push({ el: cell, date });

                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onDayClick(date);
                });
                cell.addEventListener('mouseenter', () => {
                    onDayHover(date);
                });
            }

            if (sameDay(date, today) && !sameDay(date, startDate) && !sameDay(date, endDate)) {
                cell.classList.add('today');
            }

            grid.appendChild(cell);
        }

        // Next month padding
        const totalCells = dayOfWeek + daysInMonth;
        const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let i = 1; i <= remaining; i++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day other-month';
            cell.textContent = i;
            grid.appendChild(cell);
        }

        dropdown.appendChild(grid);

        // Legend — only show if this month contains any recess days
        const hasRecessThisMonth = Array.from({ length: daysInMonth }, (_, i) => {
            const d = new Date(viewYear, viewMonth, i + 1);
            d.setHours(0, 0, 0, 0);
            return d <= today && getRecessLabel(d) !== null;
        }).some(Boolean);

        if (hasRecessThisMonth) {
            const legend = document.createElement('div');
            legend.className = 'calendar-legend';
            const legendDot = document.createElement('span');
            legendDot.className = 'calendar-legend__dot';
            legend.appendChild(legendDot);
            legend.appendChild(document.createTextNode('Parliamentary recess'));
            dropdown.appendChild(legend);
        }

        // Apply range classes + recess warning
        updateDayClasses();
        updateRecessWarning();
    }

    function updateRecessWarning() {
        // Remove existing warning if any
        const existing = dropdown.querySelector('.calendar-recess-warning');
        if (existing) existing.remove();

        const recessLabel = rangeOverlapsRecess(startDate, endDate);
        if (recessLabel && startDate && endDate) {
            const warning = document.createElement('div');
            warning.className = 'calendar-recess-warning';
            warning.textContent = `Your selected range includes parliamentary recess. Results may be limited for recess dates.`;
            dropdown.appendChild(warning);
        }
    }

    function updateDayClasses() {
        // Determine effective range for highlighting
        let rangeStart = startDate;
        let rangeEnd = endDate;

        if (selectingEnd && startDate && !endDate && hoverDate) {
            // Preview range during hover
            if (hoverDate < startDate) {
                rangeStart = hoverDate;
                rangeEnd = startDate;
            } else {
                rangeStart = startDate;
                rangeEnd = hoverDate;
            }
        }

        for (const { el, date } of dayCells) {
            // Remove range classes
            el.classList.remove('range-start', 'range-end', 'in-range', 'hover-range');

            const isStart = sameDay(date, startDate);
            const isEnd = endDate ? sameDay(date, endDate) : false;
            const isHoverEnd = (!endDate && hoverDate) ? sameDay(date, hoverDate) : false;

            if (isStart) el.classList.add('range-start');

            if (isEnd) {
                el.classList.add('range-end');
            } else if (isHoverEnd && selectingEnd) {
                el.classList.add('range-end');
            }

            if (rangeStart && rangeEnd && inRange(date, rangeStart, rangeEnd)) {
                if (endDate) {
                    el.classList.add('in-range');
                } else {
                    el.classList.add('hover-range');
                }
            }
        }
    }

    function onDayClick(date) {
        if (!selectingEnd) {
            // First click: set start, enter "selecting end" mode
            startDate = date;
            endDate = null;
            hoverDate = null;
            selectingEnd = true;
            updateDisplay();
            updateDayClasses();
        } else {
            // Second click: set end date
            if (date < startDate) {
                endDate = startDate;
                startDate = date;
            } else {
                endDate = date;
            }
            setRange(startDate, endDate);
            close();
        }
    }

    function onDayHover(date) {
        if (selectingEnd && startDate && !endDate) {
            hoverDate = date;
            updateDayClasses();  // Fast: only updates classes, no DOM rebuild
        }
    }

    // Initialise display
    updateDisplay();
})();
