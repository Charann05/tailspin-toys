import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createCanvas, joinSession } from '@github/copilot-sdk/extension';

const execFileAsync = promisify(execFile);
const servers = new Map();

const ISSUE_FIELDS = 'number,title,body,labels,updatedAt,createdAt,url,assignees';

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function truncate(value, length = 220) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function getPriority(issue) {
    const title = issue.title.toLowerCase();
    const reasons = [];
    let score = 0;

    if (title.includes('search')) {
        score += 50;
        reasons.push('removes the biggest catalog-discovery friction');
    }
    if (title.includes('sort')) {
        score += 40;
        reasons.push('builds directly on the game-list browsing experience');
    }
    if (title.includes('pagination')) {
        score += 35;
        reasons.push('protects list performance as the catalog grows');
    }
    if (title.includes('publisher')) {
        score += 25;
        reasons.push('adds a focused navigation path using existing data relationships');
    }
    if (title.includes('description')) {
        score += 20;
        reasons.push('is a contained detail-page improvement with no schema work');
    }
    if (title.includes('summary')) {
        score += 15;
        reasons.push('improves landing-page context using existing data');
    }

    const ageInDays = Math.max(0, (Date.now() - Date.parse(issue.createdAt)) / 86_400_000);
    score += Math.min(ageInDays, 30) / 10;
    if (reasons.length === 0) {
        reasons.push('is an open issue with no assignee and should be reviewed');
    }

    return { ...issue, score, reason: reasons.join('; ') + '.' };
}

async function loadIssues() {
    const { stdout } = await execFileAsync('gh', [
        'issue',
        'list',
        '--state',
        'open',
        '--limit',
        '100',
        '--json',
        ISSUE_FIELDS,
    ], { cwd: process.cwd(), maxBuffer: 2 * 1024 * 1024 });

    return JSON.parse(stdout)
        .filter((issue) => issue.assignees?.length === 0)
        .map(getPriority)
        .sort((left, right) => right.score - left.score || left.number - right.number);
}

function renderHtml(instanceId) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Issue triage board</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      color: var(--text-color-default, #1f2328);
      background: var(--background-color-default, #ffffff);
    }
    body { margin: 0; padding: 24px; max-width: 980px; }
    h1 { margin: 0 0 6px; font-size: 26px; }
    .subtitle { color: var(--text-color-muted, #656d76); margin: 0 0 24px; }
    section { margin-top: 28px; }
    section h2 { font-size: 18px; margin-bottom: 12px; }
    .board { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .card { border: 1px solid var(--border-color-default, #d0d7de); border-radius: 10px; padding: 16px; background: var(--background-color-default, #fff); }
    .card-header, .card-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .issue-number { color: var(--text-color-muted, #656d76); font-family: var(--font-mono, monospace); }
    .badge { color: var(--true-color-blue, #0969da); background: var(--true-color-blue-muted, #ddf4ff); border-radius: 999px; padding: 3px 8px; font-size: 12px; font-weight: 600; }
    h3 { margin: 12px 0 8px; font-size: 16px; }
    p { line-height: 1.45; }
    .reason { border-left: 3px solid var(--true-color-blue, #0969da); padding-left: 10px; font-size: 13px; }
    .card-footer { margin-top: 16px; }
    a { color: var(--true-color-blue, #0969da); }
    button { border: 1px solid var(--border-color-default, #d0d7de); border-radius: 6px; padding: 7px 10px; color: var(--text-color-default, #1f2328); background: var(--background-color-default, #fff); cursor: pointer; }
    button:hover { border-color: var(--true-color-blue, #0969da); }
    button:focus-visible, a:focus-visible { outline: 2px solid var(--color-focus-outline, #0969da); outline-offset: 2px; }
    .notice { padding: 12px; border-radius: 8px; background: var(--background-color-muted, #f6f8fa); }
    .empty { color: var(--text-color-muted, #656d76); }
  </style>
</head>
<body data-instance-id="${escapeHtml(instanceId)}">
  <h1>Issue triage board</h1>
  <p class="subtitle">Open, unassigned issues ranked for the next useful piece of work.</p>
  <main id="board"><p class="notice" role="status" aria-live="polite">Loading issues…</p></main>
  <script>
    const board = document.querySelector('#board');
    const escapeHtml = (value) => String(value ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
    const renderCard = (issue, priority) => \`
      <article class="card" data-testid="issue-card-\${issue.number}">
        <div class="card-header"><span class="issue-number">#\${issue.number}</span>\${priority ? '<span class="badge">Priority</span>' : ''}</div>
        <h3>\${escapeHtml(issue.title)}</h3>
        <p>\${escapeHtml(issue.description || 'No description provided.')}</p>
        \${priority ? '<p class="reason"><strong>Why now:</strong> ' + escapeHtml(issue.reason) + '</p>' : ''}
        <div class="card-footer"><a href="\${escapeHtml(issue.url)}" target="_blank" rel="noreferrer">View issue</a><button type="button" data-issue-number="\${issue.number}" data-testid="add-issue-\${issue.number}">Add to context</button></div>
      </article>\`;
    const render = (payload) => {
      const top = payload.issues.slice(0, 3);
      const rest = payload.issues.slice(3);
      board.innerHTML = (top.length ? '<section><h2>Needs attention now</h2><div class="board">' + top.map((issue) => renderCard(issue, true)).join('') + '</div></section>' : '') +
        '<section><h2>Remaining open work</h2>' + (rest.length ? '<div class="board">' + rest.map((issue) => renderCard(issue, false)).join('') + '</div>' : '<p class="empty">No other unassigned open issues.</p>') + '</section>';
    };
    const load = async () => {
      try {
        const response = await fetch('/issues');
        if (!response.ok) throw new Error(await response.text());
        render(await response.json());
      } catch (error) {
        board.innerHTML = '<p class="notice" role="alert">Unable to load issues: ' + escapeHtml(error.message) + '</p>';
      }
    };
    board.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-issue-number]');
      if (!button) return;
      button.disabled = true;
      button.textContent = 'Adding…';
      try {
        const response = await fetch('/add-to-context', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number: Number(button.dataset.issueNumber) }) });
        if (!response.ok) throw new Error(await response.text());
        button.textContent = 'Added to context';
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Try again';
        window.alert('Could not add issue to context: ' + error.message);
      }
    });
    load();
  </script>
</body>
</html>`;
}

function readJson(request) {
    return new Promise((resolve, reject) => {
        let body = '';
        request.on('data', (chunk) => { body += chunk; });
        request.on('end', () => {
            try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
        });
        request.on('error', reject);
    });
}

async function startServer(instanceId) {
    const server = createServer(async (request, response) => {
        try {
            if (request.method === 'GET' && request.url === '/issues') {
                const issues = (await loadIssues()).map((issue) => ({
                    number: issue.number,
                    title: issue.title,
                    description: truncate(issue.body),
                    reason: issue.reason,
                    url: issue.url,
                }));
                response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                response.end(JSON.stringify({ issues }));
                return;
            }

            if (request.method === 'POST' && request.url === '/add-to-context') {
                const { number } = await readJson(request);
                const issues = await loadIssues();
                const issue = issues.find((candidate) => candidate.number === number);
                if (!issue) {
                    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                    response.end('Issue not found or no longer open.');
                    return;
                }

                await session.send({
                    prompt: `Work on GitHub issue #${issue.number}: ${issue.title}\n\n${issue.body}\n\nIssue URL: ${issue.url}`,
                });
                response.writeHead(202, { 'Content-Type': 'application/json; charset=utf-8' });
                response.end(JSON.stringify({ added: issue.number }));
                return;
            }

            response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            response.end(renderHtml(instanceId));
        } catch (error) {
            response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end(error instanceof Error ? error.message : 'Unexpected error');
        }
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
}

const session = await joinSession({
    canvases: [
        createCanvas({
            id: 'issue-triage-board',
            displayName: 'Issue triage board',
            description: 'Kanban board that ranks open repository issues and adds a selected issue to the current session context.',
            actions: [
                {
                    name: 'refresh_issues',
                    description: 'Fetch and return the current ranked list of open, unassigned repository issues.',
                    handler: async () => ({ issues: await loadIssues() }),
                },
            ],
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer(ctx.instanceId);
                    servers.set(ctx.instanceId, entry);
                }
                return { title: 'Issue triage board', url: entry.url };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});
