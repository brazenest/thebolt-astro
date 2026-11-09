/**
 * Admin chart page: preview the window for the chosen period, publish, and redraw the
 * published table from the response. Everything renders with textContent — track names come
 * from AzuraCast metadata and are never treated as HTML.
 */
interface Entry {
  rank: number;
  last: number | null;
  artist: string;
  track: string;
  weeks: number;
  spins: number;
}
interface Chart {
  publishedAt: number;
  label: string;
  entries: Entry[];
}
type Reply = {
  ok?: boolean;
  error?: string;
  chart?: Chart;
  preview?: { label: string; periodStart: string; periodEnd: string };
};

const chartRoot = document.querySelector<HTMLElement>('[data-admin-chart]');
if (chartRoot) init(chartRoot);

function init(root: HTMLElement): void {
  const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const winLabel = q<HTMLElement>('[data-window-label]');
  const winRange = q<HTMLElement>('[data-window-range]');
  const publish = q<HTMLButtonElement>('[data-publish]');
  const status = q<HTMLElement>('[data-chart-status]');
  const pubLabel = q<HTMLElement>('[data-pub-label]');
  const pubMeta = q<HTMLElement>('[data-pub-meta]');
  const table = q<HTMLTableElement>('[data-pub-table]');
  const rows = q<HTMLElement>('[data-pub-rows]');

  const fmt = (d: Date) =>
    d.toLocaleString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }) + ' UTC';

  function period() {
    const v = root.querySelector<HTMLInputElement>('input[name="period"]:checked')?.value ?? 'weekly:published';
    const [type, mode] = v.split(':');
    return mode ? { type, mode } : { type };
  }

  async function post(body: unknown): Promise<{ res: Response; out: Reply }> {
    const res = await fetch('/api/admin/chart', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      location.assign('/admin/login');
      throw new Error('signed out');
    }
    return { res, out: (await res.json()) as Reply };
  }

  let previewSeq = 0;
  async function preview(): Promise<void> {
    const seq = ++previewSeq;
    winLabel.textContent = 'Calculating…';
    winRange.textContent = '';
    try {
      const { out } = await post({ period: period(), preview: true });
      if (seq !== previewSeq || !out.preview) return;
      winLabel.textContent = out.preview.label;
      winRange.textContent = `${fmt(new Date(out.preview.periodStart))} — ${fmt(new Date(out.preview.periodEnd))}`;
    } catch {
      if (seq === previewSeq) winLabel.textContent = '—';
    }
  }

  function move(e: Entry): [string, string] {
    if (e.last === null) return ['new', 'NEW'];
    if (e.last > e.rank) return ['up', `▲${e.last - e.rank}`];
    if (e.last < e.rank) return ['down', `▼${e.rank - e.last}`];
    return ['same', '–'];
  }

  function cell(text: string, cls = ''): HTMLTableCellElement {
    const td = document.createElement('td');
    if (cls) td.className = cls;
    td.textContent = text;
    return td;
  }

  function render(chart: Chart): void {
    pubLabel.textContent = chart.label;
    pubMeta.textContent = `Published ${fmt(new Date(chart.publishedAt * 1000))} · ${chart.entries.length} tracks`;
    rows.replaceChildren(
      ...chart.entries.map((e) => {
        const tr = document.createElement('tr');
        const [dir, label] = move(e);
        const mv = cell(label, 't-mono adm-move');
        mv.dataset.move = dir;
        const trk = document.createElement('td');
        const title = document.createElement('span');
        title.className = 'row__title';
        title.textContent = e.track;
        const artist = document.createElement('span');
        artist.className = 'row__artist';
        artist.textContent = e.artist;
        trk.append(title, artist);
        tr.append(cell(String(e.rank), 't-mono'), mv, trk, cell(String(e.spins), 't-mono num'), cell(String(e.weeks), 't-mono num'));
        return tr;
      })
    );
    table.hidden = chart.entries.length === 0;
  }

  root.addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).name === 'period') {
      status.textContent = '';
      void preview();
    }
  });

  publish.addEventListener('click', async () => {
    publish.disabled = true;
    status.dataset.kind = '';
    status.textContent = 'Counting spins and publishing…';
    try {
      const { res, out } = await post({ period: period() });
      if (res.ok && out.chart) {
        render(out.chart);
        status.textContent = `Published — ${out.chart.entries.length} tracks.`;
      } else {
        status.dataset.kind = 'error';
        status.textContent = out.error ?? 'Publish failed.';
      }
    } catch {
      status.dataset.kind = 'error';
      status.textContent = 'Network error. Try again.';
    } finally {
      publish.disabled = false;
    }
  });

  void preview();
}
