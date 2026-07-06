export const layout = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — eink-frame</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #f5f5f5;
  --surface: #fff;
  --border: #e0e0e0;
  --text: #1a1a1a;
  --muted: #666;
  --accent: #2563eb;
  --danger: #dc2626;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0,0,0,.08);
}
body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
header {
  background: var(--surface); border-bottom: 1px solid var(--border);
  padding: .75rem 1.5rem; display: flex; align-items: center; gap: 1rem;
}
header h1 { font-size: 1.05rem; font-weight: 600; letter-spacing: -.01em; }
header nav a { color: var(--muted); text-decoration: none; font-size: .875rem; }
header nav a:hover { color: var(--text); }
main { max-width: 72rem; margin: 2rem auto; padding: 0 1.5rem; }
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 1.25rem 1.5rem; box-shadow: var(--shadow);
}
.card + .card { margin-top: 1rem; }
h2 { font-size: .95rem; font-weight: 600; margin-bottom: .6rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.meta { color: var(--muted); font-size: .875rem; }
.btn {
  display: inline-flex; align-items: center; gap: .375rem;
  padding: .45rem .9rem; border: 1px solid var(--border); border-radius: 6px;
  font: inherit; font-size: .875rem; background: var(--surface); color: var(--text);
  cursor: pointer; text-decoration: none; transition: background .15s, border-color .15s;
}
.btn:hover { background: var(--bg); }
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-primary:hover { background: #1d4ed8; border-color: #1d4ed8; }
.btn-danger { color: var(--danger); border-color: #fca5a5; }
.btn-danger:hover { background: #fef2f2; }
.btn-row { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-top: .9rem; }
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: .75rem; margin-top: 1rem;
}
.frame-card {
  border: 1px solid var(--border); border-radius: var(--radius);
  overflow: hidden; background: var(--surface); box-shadow: var(--shadow);
}
.frame-card img { display: block; width: 100%; aspect-ratio: 4/3; object-fit: cover; background: #e5e7eb; }
.frame-card-meta { padding: .4rem .6rem; font-size: .7rem; color: var(--muted); font-family: monospace; }
.placeholder {
  width: 100%; aspect-ratio: 4/3; background: #e5e7eb;
  display: flex; align-items: center; justify-content: center;
  color: var(--muted); font-size: .75rem;
}
.upload-form { display: flex; flex-direction: column; gap: .75rem; margin-top: .75rem; }
.file-row { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
.simulate-result { margin-top: 1rem; display: none; }
.simulate-result img { max-width: 100%; border-radius: var(--radius); border: 1px solid var(--border); display: block; }
.simulate-result .sim-label { font-size: .75rem; color: var(--muted); margin-top: .4rem; }
#upload-status { font-size: .875rem; color: var(--muted); }
.qr-wrap svg { max-width: 15rem; display: block; margin: 1rem 0; }
.picker-link { word-break: break-all; font-size: .875rem; margin-bottom: .5rem; }
#poll-status {
  margin-top: 1rem; padding: .7rem 1rem;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 6px; font-size: .875rem;
}
table { border-collapse: collapse; width: 100%; margin-top: .75rem; font-size: .875rem; }
th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 600; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
.mono { font-family: monospace; }
.notice {
  margin-top: .75rem; padding: .7rem 1rem; font-size: .875rem;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px;
}
.banner { margin-top: .75rem; padding: .7rem 1rem; font-size: .875rem; border-radius: 6px; }
.banner-success { background: #f0fdf4; border: 1px solid #bbf7d0; }
.banner-error { background: #fef2f2; border: 1px solid #fca5a5; color: var(--danger); }
.spinner {
  display: inline-block; width: .9em; height: .9em;
  border: 2px solid currentColor; border-top-color: transparent;
  border-radius: 50%; animation: spin .6s linear infinite;
  vertical-align: middle; margin-right: .3em;
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 640px) { main { padding: 0 1rem; } .gallery { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); } }
</style>
</head>
<body>
<header>
  <h1>eink-frame</h1>
  <nav><a href="/">home</a> &nbsp; <a href="/firmware">firmware</a></nav>
</header>
<main>${body}</main>
</body></html>`;
