/**
 * INC-001 — helpers for driving the REAL epilepc stack from Playwright.
 *
 * The point of this file is fidelity. The reproduction does not stub epilepc:
 * it logs in through the real `LoginFormAuthenticator`, mints the token
 * through the real `CiphraMigrationController::start()` (CSRF and all), and
 * reads the resulting row out of the real `migration_token` table. That is
 * what lets the test assert the reporter's exact database fingerprint rather
 * than a lookalike.
 *
 * Stack: `epilepc/docker-compose.yml` — app on :8081, MariaDB on :3307.
 *   docker compose up -d --build
 *   docker compose exec app bin/console app:seed-demo --users=1
 */
import { execFileSync } from 'node:child_process';
import type { Page } from '@playwright/test';

export const EPILEPC_COMPOSE =
	process.env.EPILEPC_COMPOSE || '/home/danileau/work/epilepc/docker-compose.yml';

/** Host:port the epilepc container actually serves on — the "www" side. */
export const EPILEPC_HOST = process.env.EPILEPC_HOST || 'localhost:8081';

/** Seeded demo credentials (`SeedDemoDataCommand`). */
export const DEMO_EMAIL = process.env.EPILEPC_DEMO_EMAIL || 'demo1@epilepc.test';
export const DEMO_PASSWORD = process.env.EPILEPC_DEMO_PASSWORD || 'demo1234';

/** Run SQL against the epilepc database, returning tab-separated rows. */
export function epilepcSql(query: string): string[][] {
	const out = execFileSync(
		'docker',
		[
			'compose', '-f', EPILEPC_COMPOSE, 'exec', '-T', 'db',
			'mysql', '-uepilepc', '-pepilepc', 'epilepc', '-N', '-B', '-e', query,
		],
		{ encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
	);
	return out
		.split('\n')
		.filter((l) => l.trim() !== '')
		.map((l) => l.split('\t'));
}

export interface TokenRow {
	token: string;
	usedAt: string | null;
	migrationCompletedAt: string | null;
	ipFirstSeen: string | null;
	expiresAt: string | null;
}

const nullable = (v: string | undefined): string | null =>
	v === undefined || v === 'NULL' ? null : v;

/** Read the lifecycle columns for one token. */
export function readTokenRow(token: string): TokenRow | null {
	const rows = epilepcSql(
		`SELECT token, used_at, migration_completed_at, ip_first_seen, expires_at
		 FROM migration_token WHERE token = ${sqlQuote(token)}`,
	);
	if (rows.length === 0) return null;
	const [t, usedAt, completedAt, ip, expiresAt] = rows[0];
	return {
		token: t,
		usedAt: nullable(usedAt),
		migrationCompletedAt: nullable(completedAt),
		ipFirstSeen: nullable(ip),
		expiresAt: nullable(expiresAt),
	};
}

/** Tokens are `[A-Za-z0-9_-]{1,64}` (routes.yaml), but never interpolate blind. */
function sqlQuote(v: string): string {
	if (!/^[A-Za-z0-9_-]{1,64}$/.test(v)) throw new Error(`refusing to quote: ${v}`);
	return `'${v}'`;
}

/** Count rows a migration would import, straight from epilepc's tables. */
export function countSourceRecords(email: string = DEMO_EMAIL): {
	seizures: number;
	events: number;
	medications: number;
	diary: number;
} {
	// `event` and `user` are reserved words in MariaDB — always backtick.
	const q = (table: string) =>
		Number(
			epilepcSql(
				`SELECT COUNT(*) FROM \`${table}\` t
				 JOIN \`user\` u ON u.id = t.user_id
				 WHERE u.email = '${email.replace(/'/g, "''")}'`,
			)[0]?.[0] ?? 0,
		);
	return {
		seizures: q('seizure'),
		events: q('event'),
		medications: q('medication'),
		diary: q('diaryentry'),
	};
}

/**
 * Put epilepc into a known pre-migration state for the demo user.
 *
 * `profile.html.twig` renders the "already migrated" completion card — with
 * NO create-link button — whenever `user.migrated_at` is set. A previous run
 * that completed a migration therefore makes the next run unrunnable. Clearing
 * it (and the user's old tokens) keeps the reconstruction deterministic and
 * repeatable, which is the whole point of a regression test.
 */
export function resetMigrationState(email: string = DEMO_EMAIL): void {
	const safe = email.replace(/'/g, "''");
	// Expire prior tokens rather than deleting them. `findActiveForUser`
	// requires `expires_at > now`, so an expired row is never handed back —
	// but it survives for the evidence table at the end of the run, which is
	// the whole point: the RED row (all NULL) next to the GREEN row (fully
	// stamped) is what gets compared against the production table.
	epilepcSql(
		`UPDATE migration_token mt
		 JOIN \`user\` u ON u.id = mt.user_id
		 SET mt.expires_at = NOW() - INTERVAL 1 DAY
		 WHERE u.email = '${safe}'`,
	);
	epilepcSql(`UPDATE \`user\` SET migrated_at = NULL WHERE email = '${safe}'`);
}

/**
 * Log into epilepc and mint a migration link through the real UI — the exact
 * path the reporter took. Returns the raw URL from the `#migrate-url` field of
 * `migrate_link.html.twig`.
 *
 * This also exercises the session + CSRF path, which is the other half of the
 * incident: with a broken session store, `isCsrfTokenValid('migrate_start')`
 * fails and the user can never get here at all.
 */
export async function mintMigrationLink(page: Page): Promise<string> {
	await page.goto(`http://${EPILEPC_HOST}/de/login`);
	await page.locator('input[name="email"]').fill(DEMO_EMAIL);
	await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
	await page.locator('form button[type="submit"], form input[type="submit"]').first().click();
	await page.waitForLoadState('networkidle');

	await page.goto(`http://${EPILEPC_HOST}/de/app/account`);

	// Fail loudly and specifically instead of timing out on a missing button:
	// the two realistic causes are a failed login and an already-migrated user.
	if (/\/login/.test(page.url())) {
		throw new Error(`epilepc login failed for ${DEMO_EMAIL} — landed on ${page.url()}`);
	}
	const mintButton = page.getByRole('button', { name: /Migrationslink erstellen/i });
	if ((await mintButton.count()) === 0) {
		const migrated = await page.getByText(/zu ciphra übertragen/i).count();
		throw new Error(
			migrated > 0
				? 'user is already migrated (migrated_at set) — call resetMigrationState() first'
				: 'mint button not found on /app/account (lifecycle phase?)',
		);
	}
	await mintButton.click();

	const url = await page.locator('#migrate-url').inputValue();
	if (!url.includes('#migrate=')) {
		throw new Error(`minted link has no migrate fragment: ${url}`);
	}
	return url;
}

/**
 * Run `fn` while epilepc's `seizure` table is missing, so the bundle
 * serializer throws part-way through an export.
 *
 * This is how the token-burn fix gets a real test rather than a code read.
 * `export()` used to stamp `used_at` before serialising, so ANY failure after
 * that point spent the user's only link and delivered nothing. Renaming the
 * table is a fast, deterministic, fully reversible way to produce exactly that
 * class of mid-export failure.
 */
export async function withBrokenSourceTable<T>(fn: () => Promise<T>): Promise<T> {
	epilepcSql('RENAME TABLE `seizure` TO `seizure_inc001_tmp`');
	try {
		return await fn();
	} finally {
		// finally, not catch — the table comes back even if the assertion throws.
		epilepcSql('RENAME TABLE `seizure_inc001_tmp` TO `seizure`');
	}
}

export interface ParsedLink {
	token: string;
	source: string;
}

/** Split `…/migrate#migrate=<token>&source=<host>` into its parts. */
export function parseMigrationLink(url: string): ParsedLink {
	const frag = url.slice(url.indexOf('#') + 1);
	const params = new URLSearchParams(frag);
	const token = params.get('migrate');
	const source = params.get('source');
	if (!token || !source) throw new Error(`unparseable migration link: ${url}`);
	return { token, source };
}

/**
 * Rebuild a migration link against a different source host, leaving the token
 * untouched. This is how the test swaps the real minted link between the
 * broken apex, the direct host, and each candidate fix.
 */
export function withSource(baseUrl: string, token: string, source: string): string {
	return `/migrate#migrate=${encodeURIComponent(token)}&source=${encodeURIComponent(source)}`;
}
