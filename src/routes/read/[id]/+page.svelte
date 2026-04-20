<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { getBook, getWords, getProgress, saveProgress, type Book } from '$lib/storage';

	let book = $state<Book | null>(null);
	let words = $state<string[]>([]);
	let loaded = $state(false);
	let wpm = $state(350);
	let index = $state(0);
	let playing = $state(false);
	let chunkSize = $state(1);
	let settingsOpen = $state(false);

	let total = $derived(words.length);
	let current = $derived(words.slice(index, index + chunkSize).join(' ') || '');
	let progress = $derived(total ? (index / total) * 100 : 0);

	let timer: ReturnType<typeof setTimeout> | null = null;
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const id = $page.params.id;
		void load(id);
	});

	async function load(id: string) {
		const b = await getBook(id);
		if (!b) {
			goto(`${base}/`);
			return;
		}
		book = b;
		words = await getWords(id);
		const p = await getProgress(id);
		if (p && p.index < words.length) index = p.index;
		loaded = true;
	}

	$effect(() => {
		if (!book) return;
		const i = index;
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => book && saveProgress(book.id, i), 400);
	});

	onDestroy(() => {
		if (timer) clearTimeout(timer);
		if (saveTimer) clearTimeout(saveTimer);
		if (book) saveProgress(book.id, index);
	});

	function pivot(word: string) {
		if (!word) return { left: '', mid: '', right: '' };
		const len = word.length;
		let p = 0;
		if (len <= 1) p = 0;
		else if (len <= 5) p = 1;
		else if (len <= 9) p = 2;
		else if (len <= 13) p = 3;
		else p = 4;
		return { left: word.slice(0, p), mid: word[p] ?? '', right: word.slice(p + 1) };
	}
	let parts = $derived(pivot(current));

	function tick() {
		if (!playing) return;
		if (index >= total - chunkSize) {
			playing = false;
			return;
		}
		index += chunkSize;
		const delay = (60000 / wpm) * chunkSize;
		const word = words[index] ?? '';
		const extra = /[.!?,;:]$/.test(word) ? delay * 0.5 : 0;
		timer = setTimeout(tick, delay + extra);
	}

	function play() {
		if (!total) return;
		if (index >= total - chunkSize) index = 0;
		playing = true;
		const delay = (60000 / wpm) * chunkSize;
		timer = setTimeout(tick, delay);
	}
	function pause() {
		playing = false;
		if (timer) clearTimeout(timer);
	}
	function toggle() { playing ? pause() : play(); }
	function stepBack() { pause(); index = Math.max(0, index - chunkSize); }
	function stepFwd()  { pause(); index = Math.min(Math.max(0, total - 1), index + chunkSize); }
	function restart()  { pause(); index = 0; }

	function onKey(e: KeyboardEvent) {
		if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
		if (e.code === 'Space') { e.preventDefault(); toggle(); }
		else if (e.key === 'ArrowLeft') stepBack();
		else if (e.key === 'ArrowRight') stepFwd();
		else if (e.key === 'Escape') goto(`${base}/`);
	}

	async function goFullscreen() {
		try {
			await document.documentElement.requestFullscreen();
			// @ts-ignore
			await screen.orientation?.lock?.('landscape');
		} catch {}
	}

	function seek(e: Event) {
		const pct = +(e.target as HTMLInputElement).value;
		index = Math.floor((pct / 100) * total);
	}
</script>

<svelte:window on:keydown={onKey} />

<svelte:head>
	<title>{book?.title ?? 'Reader'}</title>
	<meta name="theme-color" content="#0b0d10" />
</svelte:head>

<main class="app">
	{#if !loaded}
		<div class="loading">Loading…</div>
	{:else}
		<section class="stage">
			<header class="top">
				<button class="icon back" onclick={() => goto(`${base}/`)} aria-label="Back">←</button>
				<div class="book-title">
					<div class="t">{book?.title}</div>
					<div class="a">{book?.author}</div>
				</div>
				<button class="icon" onclick={() => (settingsOpen = true)} aria-label="Settings">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
				</button>
			</header>

			<button class="stage-tap" onclick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
				<div class="guide top-g"></div>
				<div class="word" aria-live="polite">
					<span class="left">{parts.left}</span><span class="mid">{parts.mid}</span><span class="right">{parts.right}</span>
				</div>
				<div class="guide bottom-g"></div>
			</button>

			<input class="scrub" type="range" min="0" max="100" step="0.1" value={progress} oninput={seek} aria-label="Position" />

			<div class="hud">
				<button class="icon" onclick={stepBack} aria-label="Back">◀</button>
				<button class="play" onclick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
					{#if playing}
						<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M7 5v14l12-7z"/></svg>
					{/if}
				</button>
				<button class="icon" onclick={stepFwd} aria-label="Forward">▶</button>
				<div class="stat">
					<span class="num">{wpm}</span><span class="lbl">wpm</span>
				</div>
				<div class="stat">
					<span class="num">{index.toLocaleString()}/{total.toLocaleString()}</span>
					<span class="lbl">{Math.round(progress)}%</span>
				</div>
			</div>
		</section>

		{#if settingsOpen}
			<div class="sheet-bg" onclick={() => (settingsOpen = false)} role="button" tabindex="-1" aria-label="Close"></div>
			<aside class="sheet" role="dialog" aria-label="Settings">
				<div class="sheet-handle"></div>
				<div class="sheet-head">
					<h2>Reader settings</h2>
					<button class="icon" onclick={() => (settingsOpen = false)} aria-label="Close">✕</button>
				</div>

				<label>
					<span>WPM <strong>{wpm}</strong></span>
					<input type="range" min="100" max="1200" step="10" bind:value={wpm} />
				</label>
				<label>
					<span>Words per flash <strong>{chunkSize}</strong></span>
					<input type="range" min="1" max="4" step="1" bind:value={chunkSize} />
				</label>

				<div class="row">
					<button onclick={restart}>Restart</button>
					<button onclick={goFullscreen}>Fullscreen</button>
				</div>
			</aside>
		{/if}
	{/if}
</main>

<style>
	:global(html, body) {
		height: 100%;
		margin: 0;
		background: #0b0d10;
		color: #e7e9ee;
		font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
		overflow: hidden;
		overscroll-behavior: none;
		-webkit-tap-highlight-color: transparent;
		-webkit-user-select: none;
		user-select: none;
		touch-action: manipulation;
	}
	:global(textarea, input) { -webkit-user-select: text; user-select: text; }

	.app {
		position: relative;
		height: 100dvh;
		width: 100vw;
		overflow: hidden;
	}

	.loading { display: flex; align-items: center; justify-content: center; height: 100%; color: #8a94a6; }

	.stage {
		position: relative;
		height: 100%;
		display: flex;
		flex-direction: column;
		padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
		box-sizing: border-box;
	}

	.top {
		display: grid;
		grid-template-columns: 44px 1fr 44px;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
	}
	.book-title { text-align: center; overflow: hidden; }
	.book-title .t { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.book-title .a { font-size: 11px; color: #9fb1c7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

	.stage-tap {
		flex: 1;
		position: relative;
		background: transparent;
		border: 0;
		margin: 0;
		padding: 0;
		color: inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		outline: none;
	}

	.word {
		font-size: clamp(44px, 14vw, 128px);
		font-weight: 500;
		letter-spacing: -0.01em;
		display: flex;
		align-items: baseline;
		white-space: nowrap;
	}
	.left, .right { color: #cbd4e2; }
	.mid { color: #ef4444; }

	.guide {
		position: absolute;
		left: 50%;
		width: 2px;
		background: #2a3240;
	}
	.guide.top-g    { height: clamp(20px, 5vh, 48px); top: calc(50% - clamp(80px, 14vh, 140px)); }
	.guide.bottom-g { height: clamp(20px, 5vh, 48px); top: calc(50% + clamp(60px, 10vh, 100px)); }

	.scrub {
		width: calc(100% - 28px);
		margin: 0 14px;
		accent-color: #3b82f6;
	}

	.hud {
		display: grid;
		grid-template-columns: auto auto auto 1fr auto;
		align-items: center;
		gap: 10px;
		padding: 10px 14px calc(14px + env(safe-area-inset-bottom));
	}
	.hud .stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
		color: #8a94a6;
		font-size: 11px;
	}
	.hud .stat .num { color: #e7e9ee; font-size: 14px; font-weight: 600; }
	.hud .stat .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
	.hud .stat:nth-of-type(1) { margin-left: auto; }

	button.icon {
		width: 44px;
		height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: #1a2029;
		border: 1px solid #1e242d;
		border-radius: 12px;
		color: #cbd4e2;
		cursor: pointer;
		padding: 0;
		font-size: 16px;
	}
	button.icon:active { background: #222a36; transform: scale(0.96); }
	button.icon.back { background: transparent; border: 0; font-size: 22px; }

	button.play {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: #3b82f6;
		color: #fff;
		border: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: 0 8px 24px rgba(59, 130, 246, 0.35);
	}
	button.play:active { transform: scale(0.96); }

	.sheet-bg {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		z-index: 20;
		border: 0;
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 21;
		background: #11141a;
		border-top: 1px solid #1e242d;
		border-radius: 18px 18px 0 0;
		padding: 10px 18px calc(22px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-height: 85dvh;
		overflow-y: auto;
		animation: slideUp 0.22s ease-out;
	}
	@keyframes slideUp {
		from { transform: translateY(100%); }
		to { transform: translateY(0); }
	}
	.sheet-handle {
		width: 44px;
		height: 4px;
		background: #2a3240;
		border-radius: 2px;
		margin: 0 auto 6px;
	}
	.sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.sheet h2 { margin: 0; font-size: 16px; color: #9fb1c7; font-weight: 600; }

	label {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 13px;
		color: #8a94a6;
	}
	label span { display: flex; justify-content: space-between; align-items: baseline; }
	label strong { color: #e7e9ee; font-weight: 600; font-size: 15px; }

	.row { display: flex; gap: 8px; flex-wrap: wrap; }
	.row button {
		flex: 1;
		background: #1a2029;
		color: #e7e9ee;
		border: 1px solid #1e242d;
		border-radius: 10px;
		padding: 12px 14px;
		cursor: pointer;
		font-size: 14px;
		min-height: 44px;
	}
	.row button:active { background: #222a36; }
</style>
