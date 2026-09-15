/**
 * Checks whether a game title contains the supplied search text.
 *
 * @param title Game title to inspect.
 * @param query Search text entered by the player.
 * @returns Whether the title contains the query, ignoring case and surrounding whitespace.
 */
export function matchesGameTitle(title: string, query: string): boolean {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return normalizedQuery === '' || title.toLocaleLowerCase().includes(normalizedQuery);
}
