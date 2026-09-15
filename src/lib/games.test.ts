import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getFilteredGames,
    getGameById,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('filters games by any selected category', async () => {
        await seedGames(db, 3);
        const [otherCategory] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: 'other cat' })
            .returning({ id: categories.id });
        await db.insert(games).values({
            title: 'Puzzle Game',
            description: 'Puzzle description',
            starRating: 4.5,
            categoryId: otherCategory.id,
            publisherId: 1,
        });

        const filtered = await getFilteredGames(db, {
            categoryIds: [1, otherCategory.id],
        });

        expect(filtered.map((game) => game.title)).toEqual([
            'Game 01',
            'Game 02',
            'Game 03',
            'Puzzle Game',
        ]);
    });

    it('combines category and publisher filters', async () => {
        await seedGames(db, 2);
        const [otherPublisher] = await db
            .insert(publishers)
            .values({ name: 'Pub Two', description: 'other pub' })
            .returning({ id: publishers.id });
        const [category] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: 'other cat' })
            .returning({ id: categories.id });
        await db.insert(games).values({
            title: 'Puzzle Game',
            description: 'Puzzle description',
            starRating: 4.5,
            categoryId: category.id,
            publisherId: otherPublisher.id,
        });

        const filtered = await getFilteredGames(db, {
            categoryIds: [category.id],
            publisherId: otherPublisher.id,
        });

        expect(filtered.map((game) => game.title)).toEqual(['Puzzle Game']);
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});
