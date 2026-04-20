<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { listBooks, deleteBook, getCover, getProgress, type Book } from '$lib/storage';
	import { parseEpub } from '$lib/epub';

	let books = $state<Book[]>([]);
	let covers = $state<Record<string, string>>({});
	let progressMap = $state<Record<string, number>>({});
	let importing = $state(false);
	let importStatus = $state('');
	let dragOver = $state(false);
	let fileInput: HTMLInputElement;

	onMount(load);

	async function load() {
		books = await listBooks();
		for (const b of books) {
			if (b.hasCover) {
				const blob = await getCover(b.id);
				if (blob) covers[b.id] = URL.createObjectURL(blob);
			}
			const p = await getProgress(b.id);
			progressMap[b.id] = p ? p.index / Math.max(1, b.wordCount) : 0;
		}
	}

	async function handleFiles(files: FileList | null) {
		if (!files || !files.length) return;
		importing = true;
		try {
			for (const file of Array.from(files)) {
				if (!/\.epub$/i.test(file.name)) continue;
				importStatus = `Parsing ${file.name}…`;
				const { book, words, cover } = await parseEpub(file);
				importStatus = `Saving ${book.title}…`;
				const { saveBook } = await import('$lib/storage');
				await saveBook(book, words, cover);
			}
			importStatus = '';
			await load();
		} catch (e) {
			importStatus = `Error: ${(e as Error).message}`;
		} finally {
			importing = false;
		}
	}

	async function remove(id: string, e: MouseEvent) {
		e.stopPropagation();
		if (!confirm('Delete this book?')) return;
		await deleteBook(id);
		delete covers[id];
		await load();
	}

	function open(id: string) {
		goto(`${base}/read/${id}`);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		handleFiles(e.dataTransfer?.files ?? null);
	}
</script>

<svelte:head>
	<title>Speed Reader — Library</title>
</svelte:head>

<main class="app" ondragover={(e) => { e.preventDefault(); dragOver = true; }} ondragleave={() => (dragOver = false)} ondrop={onDrop} class:drag={dragOver}>
	<header class="head">
		<h1>Library</h1>
		<div class="actions">
			<button class="primary" onclick={() => fileInput.click()} disabled={importing}>
				{importing ? 'Importing…' : '+ Add EPUB'}
			</button>
			<input
				bind:this={fileInput}
				type="file"
				accept=".epub,application/epub+zip"
				multiple
				hidden
				onchange={(e) => handleFiles((e.currentTarget as HTMLInputElement).files)}
			/>
		</div>
	</header>

	{#if importStatus}
		<div class="status">{importStatus}</div>
	{/if}

	{#if books.length === 0 && !importing}
		<div class="empty">
			<div class="empty-inner">
				<div class="big">📚</div>
				<h2>No books yet</h2>
				<p>Drop EPUB files here or tap <strong>+ Add EPUB</strong> to start.</p>
				<button class="primary" onclick={() => fileInput.click()}>+ Add EPUB</button>
			</div>
		</div>
	{:else}
		<section class="grid">
			{#each books as b (b.id)}
				<div
					class="card"
					role="button"
					tabindex="0"
					onclick={() => open(b.id)}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(b.id); } }}
				>
					<div class="cover">
						{#if covers[b.id]}
							<img src={covers[b.id]} alt="" loading="lazy" />
						{:else}
							<div class="placeholder">{b.title.slice(0, 1)}</div>
						{/if}
						<div class="prog" style="width: {(progressMap[b.id] ?? 0) * 100}%"></div>
					</div>
					<div class="info">
						<div class="title">{b.title}</div>
						<div class="author">{b.author}</div>
						<div class="meta">
							{Math.round((progressMap[b.id] ?? 0) * 100)}% · {b.wordCount.toLocaleString()} words
						</div>
					</div>
					<button class="del" onclick={(e) => remove(b.id, e)} aria-label="Delete">✕</button>
				</div>
			{/each}
		</section>
	{/if}

	{#if dragOver}
		<div class="drop-overlay">Drop EPUBs to import</div>
	{/if}
</main>

<style>
	:global(html, body) {
		height: 100%;
		margin: 0;
		background: #0b0d10;
		color: #e7e9ee;
		font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
		-webkit-tap-highlight-color: transparent;
	}

	.app {
		min-height: 100dvh;
		padding: 20px 20px calc(40px + env(safe-area-inset-bottom));
		max-width: 1200px;
		margin: 0 auto;
		box-sizing: border-box;
		position: relative;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 0 20px;
		gap: 12px;
	}
	h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }

	.actions { display: flex; gap: 8px; }

	button.primary {
		background: #3b82f6;
		color: white;
		border: 0;
		border-radius: 10px;
		padding: 10px 16px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		min-height: 44px;
	}
	button.primary:active { transform: scale(0.97); }
	button.primary:disabled { opacity: 0.6; cursor: default; }

	.status {
		background: #11141a;
		border: 1px solid #1e242d;
		border-radius: 10px;
		padding: 10px 14px;
		font-size: 13px;
		color: #9fb1c7;
		margin-bottom: 16px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 16px;
	}

	.card {
		position: relative;
		background: #11141a;
		border: 1px solid #1e242d;
		border-radius: 12px;
		padding: 10px;
		text-align: left;
		color: inherit;
		font: inherit;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 10px;
		overflow: hidden;
	}
	.card:active { transform: scale(0.98); }

	.cover {
		aspect-ratio: 2 / 3;
		background: #0b0d10;
		border-radius: 6px;
		overflow: hidden;
		position: relative;
	}
	.cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
	.placeholder {
		width: 100%; height: 100%;
		display: flex; align-items: center; justify-content: center;
		font-size: 48px; color: #2a3240; font-weight: 700;
	}
	.prog {
		position: absolute; left: 0; bottom: 0;
		height: 3px; background: #3b82f6;
	}

	.info { display: flex; flex-direction: column; gap: 2px; }
	.title { font-size: 14px; font-weight: 600; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
	.author { font-size: 12px; color: #9fb1c7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.meta { font-size: 11px; color: #6b7585; margin-top: 2px; }

	.del {
		position: absolute;
		top: 6px; right: 6px;
		width: 28px; height: 28px;
		border-radius: 50%;
		background: rgba(0,0,0,0.65);
		border: 0;
		color: #e7e9ee;
		font-size: 12px;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.15s;
	}
	.card:hover .del, .card:focus-within .del { opacity: 1; }

	.empty {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 50dvh;
	}
	.empty-inner {
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: center;
	}
	.empty .big { font-size: 64px; }
	.empty h2 { margin: 0; font-size: 20px; }
	.empty p { margin: 0; color: #9fb1c7; font-size: 14px; }

	.drop-overlay {
		position: fixed;
		inset: 12px;
		background: rgba(59, 130, 246, 0.12);
		border: 2px dashed #3b82f6;
		border-radius: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #3b82f6;
		font-size: 18px;
		font-weight: 600;
		pointer-events: none;
		z-index: 50;
	}

	@media (max-width: 600px) {
		.grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; }
		.app { padding: 14px 14px calc(30px + env(safe-area-inset-bottom)); }
		.card .del { opacity: 1; }
	}
</style>
