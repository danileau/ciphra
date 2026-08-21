<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { auth, isAuthenticated } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import * as api from '$lib/api';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';

	// Redirect non-admins
	$: if ($auth.ready && (!$isAuthenticated || !$auth.isAdmin)) {
		goto('/');
	}

	interface AdminStats {
		total_users: number;
		active_users_30d: number;
		active_users_7d: number;
		total_documents: number;
		avg_docs_per_user: number;
		lockouts_30d: number;
		lockouts_today: number;
		logins_success_30d: number;
		logins_failed_30d: number;
		logins_failed_today: number;
		new_users_7d: number;
		new_users_today: number;
		deletions_30d: number;
		deletions_today: number;
		// Slice 2 — migration + dormancy metrics
		migrations_total: number;
		migrations_7d: number;
		migrations_30d: number;
		last_migration_at: string | null;
		dormant_90d: number;
	}

	interface AdminTimeseries {
		weeks: string[];
		new_users_per_week: number[];
		migrations_per_week: number[];
		logins_per_week: number[];
	}

	interface AdminUser {
		id: number;
		username: string;
		created_at: string | null;
		last_login: string | null;
		login_attempts: number;
		locked_until: string | null;
		is_admin: boolean;
		doc_count: number;
	}

	interface AuditEntry {
		id: number;
		user_id: number | null;
		username: string | null;
		action: string;
		ip_address: string | null;
		created_at: string | null;
	}

	let stats: AdminStats | null = null;
	let timeseries: AdminTimeseries | null = null;
	let users: AdminUser[] = [];
	let auditLog: AuditEntry[] = [];
	let loading = true;
	let error = '';

	// Delete confirmation
	let showDeleteModal = false;
	let deleteTarget: AdminUser | null = null;
	let deleteLoading = false;

	// Sorting
	let sortBy: keyof AdminUser = 'created_at';
	let sortAsc = false;

	onMount(loadData);

	async function loadData() {
		loading = true;
		error = '';
		try {
			const [statsRes, tsRes, usersRes, auditRes] = await Promise.all([
				api.adminGetStats(),
				api.adminGetTimeseries(),
				api.adminGetUsers(),
				api.adminGetAudit(),
			]);
			if (statsRes.ok) stats = statsRes.data as unknown as AdminStats;
			if (tsRes.ok) timeseries = tsRes.data as unknown as AdminTimeseries;
			if (usersRes.ok) users = (usersRes.data as unknown as { users: AdminUser[] }).users;
			if (auditRes.ok) auditLog = (auditRes.data as unknown as { entries: AuditEntry[] }).entries;
			if (!statsRes.ok || !tsRes.ok || !usersRes.ok || !auditRes.ok) {
				error = 'Failed to load some data';
			}
		} catch {
			error = 'Failed to load admin data';
		} finally {
			loading = false;
		}
	}

	function isLocked(user: AdminUser): boolean {
		if (!user.locked_until) return false;
		return new Date(user.locked_until) > new Date();
	}

	async function handleLock(user: AdminUser) {
		const res = await api.adminLockUser(user.id);
		if (res.ok) await loadData();
	}

	async function handleUnlock(user: AdminUser) {
		const res = await api.adminUnlockUser(user.id);
		if (res.ok) await loadData();
	}

	async function handlePromote(user: AdminUser) {
		const res = await api.adminPromoteUser(user.id);
		if (res.ok) await loadData();
	}

	async function handleDemote(user: AdminUser) {
		const res = await api.adminDemoteUser(user.id);
		if (res.ok) await loadData();
	}

	function confirmDelete(user: AdminUser) {
		deleteTarget = user;
		showDeleteModal = true;
	}

	async function handleDelete() {
		if (!deleteTarget) return;
		deleteLoading = true;
		const res = await api.adminDeleteUser(deleteTarget.id);
		deleteLoading = false;
		if (res.ok) {
			showDeleteModal = false;
			deleteTarget = null;
			await loadData();
		}
	}

	function toggleSort(col: keyof AdminUser) {
		if (sortBy === col) {
			sortAsc = !sortAsc;
		} else {
			sortBy = col;
			sortAsc = true;
		}
	}

	$: sortedUsers = [...users].sort((a, b) => {
		const av = a[sortBy];
		const bv = b[sortBy];
		if (av == null && bv == null) return 0;
		if (av == null) return 1;
		if (bv == null) return -1;
		const cmp = av < bv ? -1 : av > bv ? 1 : 0;
		return sortAsc ? cmp : -cmp;
	});

	function formatDate(iso: string | null): string {
		if (!iso) return '-';
		const d = new Date(iso);
		return d.toLocaleDateString($locale, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function formatDateTime(iso: string | null): string {
		if (!iso) return '-';
		const d = new Date(iso);
		return d.toLocaleDateString($locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function sortIcon(col: keyof AdminUser): string {
		if (sortBy !== col) return '';
		return sortAsc ? ' \u2191' : ' \u2193';
	}

	// CIPH-pi24-5b+ \u2014 Failed-login burst grouping. A brute-force attempt
	// against one username can fill the audit log with 30+ near-identical
	// LOGIN_FAILED rows in the same hour, drowning every other signal.
	// Collapse runs of consecutive LOGIN_FAILED rows that share the same
	// (username, hour) into a single rendered row with a "\u00d7N" count. The
	// API stays a raw event stream \u2014 grouping is presentation only, so
	// raw rows remain available for forensic queries.
	type GroupedRow =
		| { kind: 'single'; entry: AuditEntry; key: string }
		| {
				kind: 'group';
				key: string;
				username: string;
				count: number;
				firstTime: string | null; // chronologically earliest in the burst
				lastTime: string | null; // chronologically latest in the burst
				ipCount: number;
				sampleIp: string | null;
		  };

	function groupAudit(entries: AuditEntry[]): GroupedRow[] {
		const out: GroupedRow[] = [];
		let i = 0;
		while (i < entries.length) {
			const e = entries[i];
			if (e.action !== 'LOGIN_FAILED' || !e.created_at) {
				out.push({ kind: 'single', entry: e, key: `s-${e.id}` });
				i++;
				continue;
			}
			const hour = e.created_at.slice(0, 13); // "YYYY-MM-DDTHH"
			const username = e.username || '';
			let j = i + 1;
			const ips = new Set<string>();
			if (e.ip_address) ips.add(e.ip_address);
			while (
				j < entries.length &&
				entries[j].action === 'LOGIN_FAILED' &&
				(entries[j].username || '') === username &&
				(entries[j].created_at || '').slice(0, 13) === hour
			) {
				const ip = entries[j].ip_address;
				if (ip) ips.add(ip);
				j++;
			}
			const count = j - i;
			if (count >= 2) {
				// audit_log comes back ORDER BY created_at DESC, so the
				// first index `i` is the latest, `j-1` is the earliest.
				out.push({
					kind: 'group',
					key: `g-${e.id}`,
					username,
					count,
					firstTime: entries[j - 1].created_at,
					lastTime: e.created_at,
					ipCount: ips.size,
					sampleIp: ips.size === 1 ? [...ips][0] : null,
				});
			} else {
				out.push({ kind: 'single', entry: e, key: `s-${e.id}` });
			}
			i = j;
		}
		return out;
	}
	$: groupedAudit = groupAudit(auditLog);
</script>

<div class="layout-data py-6 space-y-6">
	<h1 class="text-2xl font-bold" style="color: var(--text-primary);">{$t('admin.title')}</h1>

	{#if loading}
		<div class="flex items-center justify-center py-20">
			<Asterisk size={32} spin color="muted" />
		</div>
	{:else if error}
		<div class="rounded-xl p-4" style="background: rgba(var(--danger-rgb),0.05); border: 1px solid rgba(var(--danger-rgb),0.15);">
			<p class="text-sm" style="color: var(--danger);">{error}</p>
		</div>
	{:else}
		<!-- Stats Cards -->
		{#if stats}
			<section>
				<h2 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted); letter-spacing: 0.04em;">{$t('admin.stats')}</h2>
				<div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
					<div class="card rounded-xl p-4">
						<p class="text-2xl font-bold num-data">{stats.total_users}</p>
						<p class="text-xs mt-1" style="color: var(--text-muted);">{$t('admin.total_users')}</p>
					</div>
					<div class="card rounded-xl p-4">
						<p class="text-2xl font-bold num-data">{stats.active_users_30d}</p>
						<p class="text-xs mt-1" style="color: var(--text-muted);">{$t('admin.active_users')} (30d)</p>
					</div>
					<div class="card rounded-xl p-4">
						<p class="text-2xl font-bold num-data">{stats.total_documents}</p>
						<p class="text-xs mt-1" style="color: var(--text-muted);">{$t('admin.total_docs')}</p>
					</div>
					<div class="card rounded-xl p-4">
						<p class="text-2xl font-bold num-danger">{stats.lockouts_30d}</p>
						<p class="text-xs mt-1" style="color: var(--text-muted);">{$t('admin.lockouts')} (30d)</p>
						<p class="text-xs mt-0.5" style="color: {stats.lockouts_today > 0 ? 'var(--danger)' : 'var(--text-muted)'};">
							{stats.lockouts_today} {$t('admin.today')}
						</p>
					</div>
					<div class="card rounded-xl p-4">
						<p class="text-2xl font-bold num-danger">{stats.deletions_30d}</p>
						<p class="text-xs mt-1" style="color: var(--text-muted);">{$t('admin.deletions')} (30d)</p>
						<p class="text-xs mt-0.5" style="color: {stats.deletions_today > 0 ? 'var(--danger)' : 'var(--text-muted)'};">
							{stats.deletions_today} {$t('admin.today')}
						</p>
					</div>
				</div>
				<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
					<div class="card rounded-xl p-4">
						<p class="text-2xl font-bold num-data">{stats.active_users_7d}</p>
						<p class="text-xs mt-1" style="color: var(--text-muted);">{$t('admin.active_users')} (7d)</p>
					</div>
					<div class="card rounded-xl p-4">
						<p class="text-2xl font-bold num-data">{stats.new_users_7d}</p>
						<p class="text-xs mt-1" style="color: var(--text-muted);">{$t('admin.new_users')} (7d)</p>
						<p class="text-xs mt-0.5" style="color: var(--text-muted);">
							{stats.new_users_today} {$t('admin.today')}
						</p>
					</div>
					<div class="card rounded-xl p-4">
						<p class="text-2xl font-bold" style="color: var(--success); font-variant-numeric: tabular-nums;">{stats.logins_success_30d}</p>
						<p class="text-xs mt-1" style="color: var(--text-muted);">{$t('admin.logins_success')}</p>
					</div>
					<div class="card rounded-xl p-4">
						<p class="text-2xl font-bold num-danger">{stats.logins_failed_30d}</p>
						<p class="text-xs mt-1" style="color: var(--text-muted);">{$t('admin.logins_failed')}</p>
						<p class="text-xs mt-0.5" style="color: {stats.logins_failed_today > 0 ? 'var(--danger)' : 'var(--text-muted)'};">
							{stats.logins_failed_today} {$t('admin.today')}
						</p>
					</div>
				</div>
			</section>
		{/if}

		<!-- Sparkline-first metrics block (Slice 2) -->
		{#if stats && timeseries}
			{@const active_pct = stats.total_users > 0 ? Math.round((stats.active_users_30d / stats.total_users) * 100) : 0}
			<section>
				<h2 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted); letter-spacing: 0.04em;">{$t('admin.trend_26w') || 'Trend — 26 Wochen'}</h2>
				<div class="rounded-xl trend-block">
					<div class="metric-row">
						<div class="metric-label">
							<p class="text-xs" style="color: var(--text-muted);">{$t('admin.total_users') || 'Total accounts'}</p>
							<p class="text-xl font-bold mt-0.5 num-data" style="line-height: 1.1;">{stats.total_users}</p>
						</div>
						<div class="metric-spark">
							<Sparkline values={timeseries.new_users_per_week} width={260} height={36} color="var(--brand, #b23c2c)" label="New users per week" />
						</div>
						<div class="metric-aside">+{stats.new_users_7d} / Woche</div>
					</div>

					<div class="metric-row">
						<div class="metric-label">
							<p class="text-xs" style="color: var(--text-muted);">{$t('admin.migrations') || 'Migrations from epilepc'}</p>
							<p class="text-xl font-bold mt-0.5 num-data" style="line-height: 1.1;">{stats.migrations_total}</p>
						</div>
						<div class="metric-spark">
							<Sparkline values={timeseries.migrations_per_week} width={260} height={36} color="var(--brand, #b23c2c)" label="Migrations per week" />
						</div>
						<div class="metric-aside">
							{#if stats.migrations_7d > 0}
								+{stats.migrations_7d} last 7d
							{:else if stats.last_migration_at}
								{$t('admin.last_migration') || 'Last'}: {formatDate(stats.last_migration_at)}
							{:else}
								—
							{/if}
						</div>
					</div>

					<div class="metric-row">
						<div class="metric-label">
							<p class="text-xs" style="color: var(--text-muted);">{$t('admin.active_users') || 'Active'} (30d)</p>
							<p class="text-xl font-bold mt-0.5 num-data" style="line-height: 1.1;">{stats.active_users_30d}</p>
						</div>
						<div class="metric-spark">
							<Sparkline values={timeseries.logins_per_week} width={260} height={36} color="var(--brand, #b23c2c)" label="Logins per week" />
						</div>
						<div class="metric-aside">{active_pct}% of total</div>
					</div>

					<div class="metric-row metric-row--last">
						<div class="metric-label">
							<p class="text-xs" style="color: var(--text-muted);">{$t('admin.dormant_90d') || 'Dormant'} (>90d)</p>
							<p class="text-xl font-bold mt-0.5 num-data" style="line-height: 1.1;">{stats.dormant_90d}</p>
						</div>
						<div class="metric-spark metric-spark--empty"></div>
						<div class="metric-aside">{stats.total_users > 0 ? Math.round((stats.dormant_90d / stats.total_users) * 100) : 0}%</div>
					</div>
				</div>
			</section>
		{/if}

		<!-- User Table -->
		<section class="card rounded-xl overflow-hidden">
			<div class="p-4" style="border-bottom: 1px solid var(--border);">
				<h2 class="text-xs font-medium uppercase tracking-wider" style="color: var(--text-muted); letter-spacing: 0.04em;">{$t('admin.users')} ({users.length})</h2>
			</div>
			{#if users.length === 0}
				<div class="p-8 text-center">
					<p class="text-sm" style="color: var(--text-muted);">{$t('admin.no_users')}</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr style="border-bottom: 1px solid var(--border);">
								<th class="text-left px-4 py-3 font-medium cursor-pointer select-none" style="color: var(--text-muted);"
									on:click={() => toggleSort('username')}>{$t('admin.username')}{sortIcon('username')}</th>
								<th class="text-left px-4 py-3 font-medium cursor-pointer select-none hidden sm:table-cell" style="color: var(--text-muted);"
									on:click={() => toggleSort('created_at')}>{$t('admin.created')}{sortIcon('created_at')}</th>
								<th class="text-left px-4 py-3 font-medium cursor-pointer select-none hidden md:table-cell" style="color: var(--text-muted);"
									on:click={() => toggleSort('last_login')}>{$t('admin.last_login')}{sortIcon('last_login')}</th>
								<th class="text-right px-4 py-3 font-medium cursor-pointer select-none" style="color: var(--text-muted);"
									on:click={() => toggleSort('doc_count')}>{$t('admin.documents')}{sortIcon('doc_count')}</th>
								<th class="text-center px-4 py-3 font-medium" style="color: var(--text-muted);">{$t('admin.status')}</th>
								<th class="text-right px-4 py-3 font-medium" style="color: var(--text-muted);">{$t('admin.actions')}</th>
							</tr>
						</thead>
						<tbody>
							{#each sortedUsers as user (user.id)}
								<tr class="transition-colors" style="border-bottom: 1px solid var(--border-subtle);" class:last:border-0={true}>
									<td class="px-4 py-3">
										<span class="font-medium" style="color: var(--text-primary);">{user.username}</span>
										{#if user.is_admin}
											<span class="ml-1.5 badge-olive" style="font-size: 10px; padding: 2px 6px;">{$t('admin.admin_badge')}</span>
										{/if}
									</td>
									<td class="px-4 py-3 hidden sm:table-cell" style="color: var(--text-muted);">{formatDate(user.created_at)}</td>
									<td class="px-4 py-3 hidden md:table-cell" style="color: var(--text-muted);">{formatDate(user.last_login)}</td>
									<td class="px-4 py-3 text-right" style="color: var(--text-primary);">{user.doc_count}</td>
									<td class="px-4 py-3 text-center">
										{#if isLocked(user)}
											<span class="badge-danger">{$t('admin.locked')}</span>
										{:else}
											<span class="badge-olive">{$t('admin.active')}</span>
										{/if}
									</td>
									<td class="px-4 py-3 text-right">
										{#if user.username !== $auth.username}
											<div class="flex items-center justify-end gap-1 flex-wrap">
												<!-- Promote / Demote -->
												{#if user.is_admin}
													<button
														on:click={() => handleDemote(user)}
														class="text-xs px-2 py-1.5 rounded-lg transition-colors min-h-[44px]"
														style="background: var(--surface-muted); color: var(--text-secondary);"
													>{$t('admin.demote')}</button>
												{:else}
													<button
														on:click={() => handlePromote(user)}
														class="text-xs px-2 py-1.5 rounded-lg transition-colors min-h-[44px]"
														style="background: var(--olive-light); color: var(--olive);"
													>{$t('admin.promote')}</button>
												{/if}
												<!-- Lock / Unlock -->
												{#if !user.is_admin}
													{#if isLocked(user)}
														<button
															on:click={() => handleUnlock(user)}
															class="text-xs px-2 py-1.5 rounded-lg transition-colors min-h-[44px]"
															style="background: rgba(var(--success-rgb),0.10); color: var(--success);"
														>{$t('admin.unlock')}</button>
													{:else}
														<button
															on:click={() => handleLock(user)}
															class="text-xs px-2 py-1.5 rounded-lg transition-colors min-h-[44px]"
															style="background: var(--ochre-light); color: var(--ochre);"
														>{$t('admin.lock')}</button>
													{/if}
													<button
														on:click={() => confirmDelete(user)}
														class="text-xs px-2 py-1.5 rounded-lg transition-colors min-h-[44px]"
														style="background: rgba(var(--danger-rgb),0.06); color: var(--danger);"
													>{$t('common.delete')}</button>
												{/if}
											</div>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		<!-- Audit Log -->
		<section class="card rounded-xl overflow-hidden">
			<div class="p-4" style="border-bottom: 1px solid var(--border);">
				<h2 class="text-xs font-medium uppercase tracking-wider" style="color: var(--text-muted); letter-spacing: 0.04em;">{$t('admin.audit')}</h2>
			</div>
			{#if auditLog.length === 0}
				<div class="p-8 text-center">
					<p class="text-sm" style="color: var(--text-muted);">{$t('admin.no_audit')}</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr style="border-bottom: 1px solid var(--border);">
								<th class="text-left px-4 py-3 font-medium" style="color: var(--text-muted);">{$t('admin.time')}</th>
								<th class="text-left px-4 py-3 font-medium" style="color: var(--text-muted);">{$t('admin.username')}</th>
								<th class="text-left px-4 py-3 font-medium" style="color: var(--text-muted);">{$t('admin.action')}</th>
								<th class="text-left px-4 py-3 font-medium hidden sm:table-cell" style="color: var(--text-muted);">{$t('admin.ip')}</th>
							</tr>
						</thead>
						<tbody>
							{#each groupedAudit as row (row.key)}
								{#if row.kind === 'single'}
									<tr style="border-bottom: 1px solid var(--border-subtle);">
										<td class="px-4 py-2 whitespace-nowrap" style="color: var(--text-muted);">{formatDateTime(row.entry.created_at)}</td>
										<td class="px-4 py-2" style="color: var(--text-primary);">{row.entry.username || '-'}</td>
										<td class="px-4 py-2">
											{#if row.entry.action.includes('FAILED') || row.entry.action.includes('LOCKED')}
												<span class="badge-danger">{row.entry.action}</span>
											{:else if row.entry.action.includes('SUCCESS') || row.entry.action === 'REGISTER'}
												<span class="badge-olive">{row.entry.action}</span>
											{:else if row.entry.action.startsWith('ADMIN_')}
												<span class="badge-ochre">{row.entry.action}</span>
											{:else}
												<span class="badge" style="background: var(--surface-muted); color: var(--text-secondary);">{row.entry.action}</span>
											{/if}
										</td>
										<td class="px-4 py-2 font-mono text-xs hidden sm:table-cell" style="color: var(--text-muted);">{row.entry.ip_address || '-'}</td>
									</tr>
								{:else}
									<!-- CIPH-pi24-5b+ — Grouped failed-login burst. The "×N" count
										 reads as a quantity glyph (locale-neutral); the time cell
										 carries a range; the IP cell shows the single IP if all
										 attempts shared one, otherwise "(N)". -->
									<tr style="border-bottom: 1px solid var(--border-subtle);">
										<td class="px-4 py-2 whitespace-nowrap" style="color: var(--text-muted);">
											<span>{formatDateTime(row.lastTime)}</span>
											<span class="block text-xs" style="color: var(--text-muted); opacity: 0.65;">{$t('admin.group_since')} {formatDateTime(row.firstTime)}</span>
										</td>
										<td class="px-4 py-2" style="color: var(--text-primary);">{row.username || '-'}</td>
										<td class="px-4 py-2">
											<span class="badge-danger">LOGIN_FAILED ×{row.count}</span>
										</td>
										<td class="px-4 py-2 font-mono text-xs hidden sm:table-cell" style="color: var(--text-muted);">
											{#if row.ipCount === 1 && row.sampleIp}
												{row.sampleIp}
											{:else if row.ipCount > 1}
												({row.ipCount})
											{:else}
												-
											{/if}
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

	{/if}
</div>

<!-- primitive-exempt: Modal — admin user-delete dialog has bespoke danger
	 chrome (blur backdrop + multi-button footer with loading state) the Modal
	 primitive does not expose today. Sweep target for a future admin pass. -->
<!-- Delete confirmation modal -->
{#if showDeleteModal && deleteTarget}
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center p-4"
	style="background: rgba(0,0,0,0.4); backdrop-filter: blur(4px);"
	on:click|self={() => { showDeleteModal = false; }}
	on:keydown={(e) => { if (e.key === 'Escape') showDeleteModal = false; }}
	role="dialog"
	aria-modal="true"
	tabindex="-1"
>
	<div class="card rounded-2xl p-6 max-w-sm w-full" style="box-shadow: 0 20px 60px rgba(44,37,32,0.15);">
		<h3 class="text-lg font-semibold mb-2" style="color: var(--text-primary);">{$t('admin.delete_user')}</h3>
		<p class="text-sm mb-4" style="color: var(--text-muted);">
			{$t('admin.delete_confirm', { username: deleteTarget.username, count: String(deleteTarget.doc_count) })}
		</p>
		<div class="flex gap-3">
			<button
				on:click={() => { showDeleteModal = false; }}
				class="btn-secondary flex-1 py-2 rounded-xl text-sm font-medium min-h-[44px]"
			>
				{$t('common.cancel')}
			</button>
			<button
				on:click={handleDelete}
				disabled={deleteLoading}
				class="flex-1 py-2 rounded-xl text-sm font-medium min-h-[44px] transition-colors"
				style="background: var(--danger); color: white;"
			>
				{deleteLoading ? $t('common.loading') : $t('common.delete')}
			</button>
		</div>
	</div>
</div>
{/if}

<style>
	.trend-block {
		background: var(--surface-card);
		border: 1px solid var(--border);
	}
	.metric-row {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--border);
	}
	.metric-row--last { border-bottom: 0; }

	.metric-label {
		flex: 1 1 auto;
		min-width: 0;
	}
	.metric-spark {
		flex: 0 0 auto;
	}
	/* Force the Sparkline SVG (which sets its own width attribute) to
	   shrink to the column. preserveAspectRatio="none" already lets it
	   stretch — we override the attribute width via CSS. */
	.metric-spark :global(svg) {
		max-width: 100%;
		height: auto;
	}
	.metric-spark--empty {
		width: 260px;
		height: 36px;
	}
	.metric-aside {
		flex: 0 0 auto;
		text-align: right;
		white-space: nowrap;
		color: var(--text-muted);
		font-size: 12px;
	}

	/* Phone. Stack the row: label on top, sparkline full-width,
	   side stat next to label. The 260px fixed-width sparkline was
	   forcing horizontal overflow on every viewport <640px. */
	@media (max-width: 640px) {
		.metric-row {
			flex-wrap: wrap;
			gap: 8px;
			padding: 12px 14px;
		}
		.metric-label {
			flex: 1 1 60%;
			min-width: 0;
		}
		.metric-aside {
			flex: 0 0 auto;
			align-self: flex-start;
			padding-top: 4px;
		}
		.metric-spark {
			flex: 1 1 100%;
			order: 3; /* drop the spark beneath the label+aside line */
		}
		.metric-spark :global(svg) {
			width: 100% !important;
		}
		.metric-spark--empty {
			display: none; /* placeholder column not needed when stacked */
		}
	}
</style>
