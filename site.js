// Local-only enhancement. No analytics, network calls or form submissions.
(() => {
  try {
    const parts = new Intl.DateTimeFormat('en-AU', {timeZone:'Australia/Sydney',weekday:'short',hour:'numeric',hour12:false}).formatToParts(new Date());
    const weekday = parts.find(p=>p.type==='weekday')?.value;
    const hour = Number(parts.find(p=>p.type==='hour')?.value);
    const inHours = ['Mon','Tue','Wed','Thu','Fri'].includes(weekday) && hour >= 9 && hour < 17;
    if (!inHours) document.querySelectorAll('[data-after-hours]').forEach(el=>{el.hidden=false;});
  } catch (_) { /* A missing clock feature must not hide the phone number. */ }
})();
