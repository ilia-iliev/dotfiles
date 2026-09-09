export function orderSupplementalStats(
	cost: string,
	speed: string | undefined,
	limit: string | undefined,
): string[] {
	const stats = [cost];
	if (speed) stats.push(speed);
	if (limit) stats.push(limit);
	return stats;
}
