<script lang="ts">
	import { t } from '$lib/i18n';
	import { auth, isAuthenticated } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import * as api from '$lib/api';

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
		logins_success_30d: number;
		logins_failed_30d: number;
		new_users_7d: number;
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
			const [statsRes, usersRes, auditRes] = await Promise.all([
				api.adminGetStats(),
				api.adminGetUsers(),
				api.adminGetAudit(),
			]);
			if (statsRes.ok) stats = statsRes.data as unknown as AdminStats;
			if (usersRes.ok) users = (usersRes.data as unknown as { users: AdminUser[] }).users;
			if (auditRes.ok) auditLog = (auditRes.data as unknown as { entries: AuditEntry[] }).entries;
			if (!statsRes.ok || !usersRes.ok || !auditRes.ok) {
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
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function formatDateTime(iso: string | null): string {
		if (!iso) return '-';
		const d = new Date(iso);
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function sortIcon(col: keyof AdminUser): string {
		if (sortBy !== col) return '';
		return sortAsc ? ' \u2191' : ' \u2193';
	}
</script>

<div class="max-w-6xl mx-auto px-4 py-6 space-y-6">
	<h1 class="text-2xl font-bold text-stone-900 dark:text-white">{$t('admin.title')}</h1>

	{#if loading}
		<div class="flex items-center justify-center py-20">
			<p class="text-stone-400 text-sm">{$t('common.loading')}</p>
		</div>
	{:else if error}
		<div class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4">
			<p class="text-sm text-red-700 dark:text-red-300">{error}</p>
		</div>
	{:else}
		<!-- Stats Cards -->
		{#if stats}
			<section>
				<h2 class="text-sm font-medium text-stone-400 uppercase tracking-wider mb-3">{$t('admin.stats')}</h2>
				<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
					<div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
						<p class="text-2xl font-bold text-stone-900 dark:text-white">{stats.total_users}</p>
						<p class="text-xs text-stone-500 dark:text-stone-400 mt-1">{$t('admin.total_users')}</p>
					</div>
					<div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
						<p class="text-2xl font-bold text-stone-900 dark:text-white">{stats.active_users_30d}</p>
						<p class="text-xs text-stone-500 dark:text-stone-400 mt-1">{$t('admin.active_users')} (30d)</p>
					</div>
					<div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
						<p class="text-2xl font-bold text-stone-900 dark:text-white">{stats.total_documents}</p>
						<p class="text-xs text-stone-500 dark:text-stone-400 mt-1">{$t('admin.total_docs')}</p>
					</div>
					<div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
						<p class="text-2xl font-bold text-stone-900 dark:text-white">{stats.lockouts_30d}</p>
						<p class="text-xs text-stone-500 dark:text-stone-400 mt-1">{$t('admin.lockouts')} (30d)</p>
					</div>
				</div>
				<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
					<div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
						<p class="text-2xl font-bold text-stone-900 dark:text-white">{stats.active_users_7d}</p>
						<p class="text-xs text-stone-500 dark:text-stone-400 mt-1">{$t('admin.active_users')} (7d)</p>
					</div>
					<div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
						<p class="text-2xl font-bold text-stone-900 dark:text-white">{stats.new_users_7d}</p>
						<p class="text-xs text-stone-500 dark:text-stone-400 mt-1">{$t('admin.new_users')} (7d)</p>
					</div>
					<div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
						<p class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.logins_success_30d}</p>
						<p class="text-xs text-stone-500 dark:text-stone-400 mt-1">{$t('admin.logins_success')}</p>
					</div>
					<div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
						<p class="text-2xl font-bold text-red-600 dark:text-red-400">{stats.logins_failed_30d}</p>
						<p class="text-xs text-stone-500 dark:text-stone-400 mt-1">{$t('admin.logins_failed')}</p>
					</div>
				</div>
			</section>
		{/if}

		<!-- User Table -->
		<section class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
			<div class="p-4 border-b border-stone-200 dark:border-stone-800">
				<h2 class="text-sm font-medium text-stone-400 uppercase tracking-wider">{$t('admin.users')} ({users.length})</h2>
			</div>
			{#if users.length === 0}
				<div class="p-8 text-center">
					<p class="text-sm text-stone-400">{$t('admin.no_users')}</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-stone-200 dark:border-stone-800">
								<th class="text-left px-4 py-3 font-medium text-stone-500 dark:text-stone-400 cursor-pointer hover:text-stone-700 dark:hover:text-stone-200 select-none"
									on:click={() => toggleSort('username')}>{$t('admin.username')}{sortIcon('username')}</th>
								<th class="text-left px-4 py-3 font-medium text-stone-500 dark:text-stone-400 cursor-pointer hover:text-stone-700 dark:hover:text-stone-200 select-none hidden sm:table-cell"
									on:click={() => toggleSort('created_at')}>{$t('admin.created')}{sortIcon('created_at')}</th>
								<th class="text-left px-4 py-3 font-medium text-stone-500 dark:text-stone-400 cursor-pointer hover:text-stone-700 dark:hover:text-stone-200 select-none hidden md:table-cell"
									on:click={() => toggleSort('last_login')}>{$t('admin.last_login')}{sortIcon('last_login')}</th>
								<th class="text-right px-4 py-3 font-medium text-stone-500 dark:text-stone-400 cursor-pointer hover:text-stone-700 dark:hover:text-stone-200 select-none"
									on:click={() => toggleSort('doc_count')}>{$t('admin.documents')}{sortIcon('doc_count')}</th>
								<th class="text-center px-4 py-3 font-medium text-stone-500 dark:text-stone-400">{$t('admin.status')}</th>
								<th class="text-right px-4 py-3 font-medium text-stone-500 dark:text-stone-400">{$t('admin.actions')}</th>
							</tr>
						</thead>
						<tbody>
							{#each sortedUsers as user (user.id)}
								<tr class="border-b border-stone-100 dark:border-stone-800/50 last:border-0 hover:bg-stone-50 dark:hover:bg-stone-800/30">
									<td class="px-4 py-3">
										<span class="font-medium text-stone-900 dark:text-white">{user.username}</span>
										{#if user.is_admin}
											<span class="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 font-medium">admin</span>
										{/if}
									</td>
									<td class="px-4 py-3 text-stone-500 dark:text-stone-400 hidden sm:table-cell">{formatDate(user.created_at)}</td>
									<td class="px-4 py-3 text-stone-500 dark:text-stone-400 hidden md:table-cell">{formatDate(user.last_login)}</td>
									<td class="px-4 py-3 text-right text-stone-900 dark:text-white">{user.doc_count}</td>
									<td class="px-4 py-3 text-center">
										{#if isLocked(user)}
											<span class="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">{$t('admin.locked')}</span>
										{:else}
											<span class="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">{$t('admin.active')}</span>
										{/if}
									</td>
									<td class="px-4 py-3 text-right">
										{#if user.username !== $auth.username && !user.is_admin}
											<div class="flex items-center justify-end gap-1">
												{#if isLocked(user)}
													<button
														on:click={() => handleUnlock(user)}
														class="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors min-h-[32px]"
													>{$t('admin.unlock')}</button>
												{:else}
													<button
														on:click={() => handleLock(user)}
														class="text-xs px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors min-h-[32px]"
													>{$t('admin.lock')}</button>
												{/if}
												<button
													on:click={() => confirmDelete(user)}
													class="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors min-h-[32px]"
												>{$t('common.delete')}</button>
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
		<section class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
			<div class="p-4 border-b border-stone-200 dark:border-stone-800">
				<h2 class="text-sm font-medium text-stone-400 uppercase tracking-wider">{$t('admin.audit')}</h2>
			</div>
			{#if auditLog.length === 0}
				<div class="p-8 text-center">
					<p class="text-sm text-stone-400">{$t('admin.no_audit')}</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-stone-200 dark:border-stone-800">
								<th class="text-left px-4 py-3 font-medium text-stone-500 dark:text-stone-400">{$t('admin.time')}</th>
								<th class="text-left px-4 py-3 font-medium text-stone-500 dark:text-stone-400">{$t('admin.username')}</th>
								<th class="text-left px-4 py-3 font-medium text-stone-500 dark:text-stone-400">{$t('admin.action')}</th>
								<th class="text-left px-4 py-3 font-medium text-stone-500 dark:text-stone-400 hidden sm:table-cell">{$t('admin.ip')}</th>
							</tr>
						</thead>
						<tbody>
							{#each auditLog as entry (entry.id)}
								<tr class="border-b border-stone-100 dark:border-stone-800/50 last:border-0">
									<td class="px-4 py-2.5 text-stone-500 dark:text-stone-400 whitespace-nowrap">{formatDateTime(entry.created_at)}</td>
									<td class="px-4 py-2.5 text-stone-900 dark:text-white">{entry.username || '-'}</td>
									<td class="px-4 py-2.5">
										<span class="text-xs px-2 py-0.5 rounded-full font-medium
											{entry.action.includes('FAILED') || entry.action.includes('LOCKED')
												? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400'
												: entry.action.includes('SUCCESS') || entry.action === 'REGISTER'
													? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
													: entry.action.startsWith('ADMIN_')
														? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400'
														: 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'}"
										>{entry.action}</span>
									</td>
									<td class="px-4 py-2.5 text-stone-400 dark:text-stone-500 font-mono text-xs hidden sm:table-cell">{entry.ip_address || '-'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		<!-- Zero-knowledge reminder -->
		<div class="flex items-center justify-center gap-2 py-4">
			<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke-width="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke-width="2"/></svg>
			<span class="text-xs text-stone-400 dark:text-stone-500">{$t('admin.zero_knowledge')}</span>
		</div>
	{/if}
</div>

<!-- Delete confirmation modal -->
{#if showDeleteModal && deleteTarget}
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" on:click|self={() => { showDeleteModal = false; }}>
	<div class="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-6 max-w-sm w-full shadow-xl">
		<h3 class="text-lg font-semibold text-stone-900 dark:text-white mb-2">{$t('admin.delete_user')}</h3>
		<p class="text-sm text-stone-500 dark:text-stone-400 mb-4">
			{$t('admin.delete_confirm', { username: deleteTarget.username, count: String(deleteTarget.doc_count) })}
		</p>
		<div class="flex gap-3">
			<button
				on:click={() => { showDeleteModal = false; }}
				class="flex-1 py-2.5 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl text-sm font-medium min-h-[44px]"
			>
				{$t('common.cancel')}
			</button>
			<button
				on:click={handleDelete}
				disabled={deleteLoading}
				class="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:bg-stone-300 min-h-[44px]"
			>
				{deleteLoading ? $t('common.loading') : $t('common.delete')}
			</button>
		</div>
	</div>
</div>
{/if}
