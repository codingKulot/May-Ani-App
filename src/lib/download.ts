/** Lets the user save a file the app made (a backup, a report) to their phone or PC. */
export function saveFile(name: string, content: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Some browsers start the download only after click() returns, so revoking the link at once can cancel it.
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
