// Never replace the website with a site-wide lock or maintenance screen.
// Authentication and individual data errors are handled inside the app.
export function onRequest(context) {
  return context.next();
}
