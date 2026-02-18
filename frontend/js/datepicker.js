/* Custom Date Range Picker — click start, hover range, click end */

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
        if (start) startInput.value = fmt(start);
        else startInput.value = '';
        if (end) endInput.value = fmt(end);
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

            if (isFuture) {
                cell.className = 'calendar-day future';
            } else {
                cell.className = 'calendar-day';
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

        // Apply range classes
        updateDayClasses();
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
