import ePub from 'epubjs';
import type { Book } from './storage';

export type ParsedEpub = {
	book: Book;
	words: string[];
	cover: Blob | null;
};

export async function parseEpub(file: File): Promise<ParsedEpub> {
	const buf = await file.arrayBuffer();
	const epub = ePub(buf);
	await epub.ready;

	const meta = epub.packaging?.metadata ?? {};
	const title = (meta.title as string) || file.name.replace(/\.epub$/i, '');
	const author = (meta.creator as string) || 'Unknown';

	let cover: Blob | null = null;
	try {
		const coverUrl = await epub.coverUrl();
		if (coverUrl) {
			const res = await fetch(coverUrl);
			cover = await res.blob();
		}
	} catch {}

	const spine = epub.spine as unknown as { spineItems: { href: string; load: (fn: unknown) => Promise<unknown>; unload: () => void }[] };
	const items = spine.spineItems ?? [];
	const chunks: string[] = [];
	for (const item of items) {
		try {
			// @ts-ignore — epubjs load signature
			const doc = await item.load(epub.load.bind(epub));
			const text = extractText(doc as Document);
			if (text) chunks.push(text);
			item.unload();
		} catch {}
	}
	const full = chunks.join(' ').replace(/\s+/g, ' ').trim();
	const words = full.split(' ').filter(Boolean);

	const id = crypto.randomUUID();
	return {
		book: {
			id,
			title,
			author,
			addedAt: Date.now(),
			wordCount: words.length,
			hasCover: !!cover
		},
		words,
		cover
	};
}

function extractText(doc: Document): string {
	const body = doc?.body ?? doc?.documentElement;
	if (!body) return '';
	body.querySelectorAll('script,style,nav,header,footer').forEach((n) => n.remove());
	return (body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
