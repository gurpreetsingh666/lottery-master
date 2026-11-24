const shiftClockLabel = document.createElement('div');
shiftClockLabel.className = 'shift-clock';
shiftClockLabel.innerHTML = '<span>Current Time</span> <time></time>';
todayPanel.querySelector('h1').after(shiftClockLabel);
const shiftClockTime = shiftClockLabel.querySelector('time');
const storeTimeFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Indiana/Indianapolis', hour: 'numeric', minute: '2-digit', hour12: true
});
function updateShiftClock() {
  const now = new Date();
  const display = storeTimeFormat.format(now);
  if (shiftClockTime.textContent !== display) {
    shiftClockTime.textContent = display;
    shiftClockTime.dateTime = now.toISOString();
  }
}
updateShiftClock();
setInterval(updateShiftClock, 1000);
document.addEventListener('visibilitychange', updateShiftClock);
window.addEventListener('pageshow', updateShiftClock);