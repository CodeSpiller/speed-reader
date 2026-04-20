import { get, set, del, keys } from 'idb-keyval';

export type Book = {
	id: string;
	title: string;
	author: string;
	addedAt: number;
	wordCount: number;
	hasCover: boolean;
};

export type Progress = {
	index: number;
	updatedAt: number;
};

const BOOKS_KEY = 'books';

export async function listBooks(): Promise<Book[]> {
	return (await get<Book[]>(BOOKS_KEY)) ?? [];
}

export async function saveBook(
	book: Book,
	words: string[],
	cover: Blob | null
): Promise<void> {
	const all = await listBooks();
	const idx = all.findIndex((b) => b.id === book.id);
	if (idx >= 0) all[idx] = book;
	else all.unshift(book);
	await set(BOOKS_KEY, all);
	await set(`words:${book.id}`, words);
	if (cover) await set(`cover:${book.id}`, cover);
}

export async function getWords(id: string): Promise<string[]> {
	return (await get<string[]>(`words:${id}`)) ?? [];
}

export async function getCover(id: string): Promise<Blob | null> {
	return (await get<Blob>(`cover:${id}`)) ?? null;
}

export async function getProgress(id: string): Promise<Progress | null> {
	return (await get<Progress>(`progress:${id}`)) ?? null;
}

export async function saveProgress(id: string, index: number): Promise<void> {
	await set(`progress:${id}`, { index, updatedAt: Date.now() });
}

export async function deleteBook(id: string): Promise<void> {
	const all = (await listBooks()).filter((b) => b.id !== id);
	await set(BOOKS_KEY, all);
	await del(`words:${id}`);
	await del(`cover:${id}`);
	await del(`progress:${id}`);
}

export async function getBook(id: string): Promise<Book | null> {
	const all = await listBooks();
	return all.find((b) => b.id === id) ?? null;
}

export async function clearAll(): Promise<void> {
	const all = await keys();
	await Promise.all(all.map((k) => del(k)));
}
