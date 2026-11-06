// Small visuals for calculator results: comparison bars, a stacked
// "where the money comes from" bar, and a growth chart. Plain HTML/SVG,
// no libraries, styled by .viz-* rules in style.css.
(function (root) {
	const TONES = ["gold", "gold2", "grey", "light"];

	function money(value) {
		return `$${Math.round(Number(value) || 0).toLocaleString("en-SG")}`;
	}

	function short(value) {
		const v = Math.round(Number(value) || 0);
		if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(v >= 10000000 ? 0 : 1).replace(/\.0$/, "")}M`;
		if (Math.abs(v) >= 10000) return `$${Math.round(v / 1000)}k`;
		return money(v);
	}

	// items: [{ label, value, text?, strong? }]
	function bars(title, items) {
		const list = items.filter((i) => Number.isFinite(i.value) && i.value >= 0);
		if (!list.length) return "";
		const max = Math.max(...list.map((i) => i.value), 1);
		return `<figure class="viz"><figcaption>${title}</figcaption>${list
			.map((i) => `<div class="viz-bar${i.strong ? " is-strong" : ""}"><span class="viz-bar-label">${i.label}</span><span class="viz-bar-track"><i style="width:${Math.max(2, (i.value / max) * 100)}%"></i></span><b>${i.text || money(i.value)}</b></div>`)
			.join("")}</figure>`;
	}

	// segments: [{ label, value }] -> one stacked bar plus a legend
	function stack(title, segments) {
		const list = segments.filter((s) => s.value > 0);
		const total = list.reduce((sum, s) => sum + s.value, 0);
		if (!total) return "";
		return `<figure class="viz"><figcaption>${title}</figcaption><div class="viz-stack">${list
			.map((s, i) => `<i class="tone-${TONES[i % TONES.length]}" style="width:${(s.value / total) * 100}%"></i>`)
			.join("")}</div><div class="viz-legend">${list
			.map((s, i) => `<span><i class="tone-${TONES[i % TONES.length]}"></i>${s.label} <b>${short(s.value)}</b></span>`)
			.join("")}</div></figure>`;
	}

	// points: [{ x, total, base }] -> area chart: total value, with what you put in underneath
	function growth(title, points, labels) {
		if (!points.length) return "";
		const W = 320;
		const H = 140;
		const pad = 4;
		const max = Math.max(...points.map((p) => p.total), 1);
		const xs = (i) => pad + (i / Math.max(1, points.length - 1)) * (W - pad * 2);
		const ys = (v) => H - pad - (v / max) * (H - pad * 2);
		const line = (key) => points.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${ys(p[key]).toFixed(1)}`).join(" ");
		const area = (key) => `${line(key)} L${xs(points.length - 1).toFixed(1)},${H - pad} L${pad},${H - pad} Z`;
		const last = points[points.length - 1];
		return `<figure class="viz"><figcaption>${title}</figcaption><svg class="viz-growth" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${title}">
			<path class="viz-area-total" d="${area("total")}"/><path class="viz-area-base" d="${area("base")}"/>
			<path class="viz-line-total" d="${line("total")}"/></svg>
			<div class="viz-axis"><span>${points[0].x}</span><span>${last.x}</span></div>
			<div class="viz-legend"><span><i class="tone-gold"></i>${labels[0]} <b>${short(last.total)}</b></span><span><i class="tone-grey"></i>${labels[1]} <b>${short(last.base)}</b></span></div></figure>`;
	}

	// series: [{ label, values }] stacked bottom-up over the same x labels
	function layers(title, xLabels, series) {
		const n = xLabels.length;
		if (n < 2 || !series.length) return "";
		const W = 320;
		const H = 140;
		const sums = series.map((_, k) => xLabels.map((__, i) => series.slice(0, k + 1).reduce((t, s) => t + (Number(s.values[i]) || 0), 0)));
		const max = Math.max(...sums[sums.length - 1], 1);
		const xs = (i) => ((i / (n - 1)) * W).toFixed(1);
		const ys = (v) => (H - (v / max) * (H - 4)).toFixed(1);
		const area = (row) => `M0,${H} ${row.map((v, i) => `L${xs(i)},${ys(v)}`).join(" ")} L${W},${H} Z`;
		const paths = sums.map((row, k) => `<path class="viz-layer tone-fill-${k}" d="${area(row)}"/>`).reverse().join("");
		const last = n - 1;
		return `<figure class="viz"><figcaption>${title}</figcaption><svg class="viz-growth" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${title}">${paths}</svg>
			<div class="viz-axis"><span>${xLabels[0]}</span><span>${xLabels[last]}</span></div>
			<div class="viz-legend">${series.map((s, k) => `<span><i class="tone-${TONES[k % TONES.length]}"></i>${s.label} <b>${short(s.values[last])}</b></span>`).join("")}</div></figure>`;
	}

	root.CalcViz = { bars, stack, growth, layers, money, short };
})(typeof self !== "undefined" ? self : this);
