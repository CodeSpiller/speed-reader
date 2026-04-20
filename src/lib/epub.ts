import JSZip from 'jszip';
import type { Book } from './storage';

export type ParsedEpub = {
	book: Book;
	words: string[];
	cover: Blob | null;
};

const parser = new DOMParser();

export async function parseEpub(file: File): Promise<ParsedEpub> {
	const zip = await JSZip.loadAsync(await file.arrayBuffer());

	const containerXml = await readText(zip, 'META-INF/container.xml');
	if (!containerXml) throw new Error('Invalid EPUB: no container.xml');

	const container = parser.parseFromString(containerXml, 'application/xml');
	const opfPath = container.querySelector('rootfile')?.getAttribute('full-path');
	if (!opfPath) throw new Error('Invalid EPUB: no OPF rootfile');

	const opfDir = dirname(opfPath);
	const opfXml = await readText(zip, opfPath);
	if (!opfXml) throw new Error('Invalid EPUB: missing OPF');
	const opf = parser.parseFromString(opfXml, 'application/xml');

	const title =
		opf.querySelector('metadata > title, metadata title')?.textContent?.trim() ||
		file.name.replace(/\.epub$/i, '');
	const author =
		opf.querySelector('metadata > creator, metadata creator')?.textContent?.trim() || 'Unknown';

	const manifestItems = new Map<string, { href: string; mediaType: string; properties: string }>();
	opf.querySelectorAll('manifest > item').forEach((el) => {
		const id = el.getAttribute('id');
		if (!id) return;
		manifestItems.set(id, {
			href: el.getAttribute('href') || '',
			mediaType: el.getAttribute('media-type') || '',
			properties: el.getAttribute('properties') || ''
		});
	});

	const spineRefs: string[] = [];
	opf.querySelectorAll('spine > itemref').forEach((el) => {
		const idref = el.getAttribute('idref');
		if (idref) spineRefs.push(idref);
	});

	const chunks: string[] = [];
	for (const idref of spineRefs) {
		const item = manifestItems.get(idref);
		if (!item) continue;
		const path = joinPath(opfDir, item.href);
		const html = await readText(zip, path);
		if (!html) continue;
		const mime = item.mediaType || 'application/xhtml+xml';
		const doc = parser.parseFromString(html, mime.includes('html') ? 'text/html' : 'application/xhtml+xml');
		chunks.push(extractText(doc));
	}

	const full = chunks.join(' ').replace(/\s+/g, ' ').trim();
	const words = full.split(' ').filter(Boolean);

	const cover = await extractCover(zip, opf, opfDir, manifestItems);

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

async function readText(zip: JSZip, path: string): Promise<string | null> {
	const file = zip.file(decodeURIComponent(path)) || zip.file(path);
	if (!file) return null;
	return await file.async('string');
}

async function readBlob(zip: JSZip, path: string, mime: string): Promise<Blob | null> {
	const file = zip.file(decodeURIComponent(path)) || zip.file(path);
	if (!file) return null;
	const buf = await file.async('arraybuffer');
	return new Blob([buf], { type: mime || 'application/octet-stream' });
}

function extractText(doc: Document): string {
	const body = doc.body ?? doc.documentElement;
	if (!body) return '';
	body.querySelectorAll('script,style,nav,header,footer').forEach((n) => n.remove());
	return (body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

async function extractCover(
	zip: JSZip,
	opf: Document,
	opfDir: string,
	manifestItems: Map<string, { href: string; mediaType: string; properties: string }>
): Promise<Blob | null> {
	// 1. Manifest item with properties="cover-image" (EPUB 3)
	for (const [, item] of manifestItems) {
		if (item.properties?.split(/\s+/).includes('cover-image')) {
			return readBlob(zip, joinPath(opfDir, item.href), item.mediaType);
		}
	}
	// 2. Metadata <meta name="cover" content="id"> (EPUB 2)
	const coverMeta = Array.from(opf.querySelectorAll('metadata > meta, metadata meta')).find(
		(m) => m.getAttribute('name') === 'cover'
	);
	const coverId = coverMeta?.getAttribute('content');
	if (coverId) {
		const item = manifestItems.get(coverId);
		if (item) return readBlob(zip, joinPath(opfDir, item.href), item.mediaType);
	}
	// 3. Fallback: first image in manifest
	for (const [, item] of manifestItems) {
		if (item.mediaType.startsWith('image/')) {
			return readBlob(zip, joinPath(opfDir, item.href), item.mediaType);
		}
	}
	return null;
}

function dirname(p: string): string {
	const i = p.lastIndexOf('/');
	return i < 0 ? '' : p.slice(0, i);
}

function joinPath(dir: string, rel: string): string {
	if (!dir) return rel;
	if (rel.startsWith('/')) return rel.slice(1);
	const parts = (dir + '/' + rel).split('/');
	const out: string[] = [];
	for (const part of parts) {
		if (part === '.' || part === '') continue;
		if (part === '..') out.pop();
		else out.push(part);
	}
	return out.join('/');
}
