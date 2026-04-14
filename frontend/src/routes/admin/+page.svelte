<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { auth, isAuthenticated } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import * as api from '$lib/api';
	import Asterisk from '$lib/components/Asterisk.svelte';

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
</script>

<div class="max-w-6xl mx-auto px-4 py-6 space-y-6">
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
				<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
					</div>
					<div class="card rounded-xl p-4">
						<p class="text-2xl font-bold" style="color: var(--success); font-variant-numeric: tabular-nums;">{stats.logins_success_30d}</p>
						<p class="text-xs mt-1" style="color: var(--text-muted);">{$t('admin.logins_success')}</p>
					</div>
					<div class="card rounded-xl p-4">
						<p class="text-2xl font-bold num-danger">{stats.logins_failed_30d}</p>
						<p class="text-xs mt-1" style="color: var(--text-muted);">{$t('admin.logins_failed')}</p>
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
							{#each auditLog as entry (entry.id)}
								<tr style="border-bottom: 1px solid var(--border-subtle);">
									<td class="px-4 py-2 whitespace-nowrap" style="color: var(--text-muted);">{formatDateTime(entry.created_at)}</td>
									<td class="px-4 py-2" style="color: var(--text-primary);">{entry.username || '-'}</td>
									<td class="px-4 py-2">
										{#if entry.action.includes('FAILED') || entry.action.includes('LOCKED')}
											<span class="badge-danger">{entry.action}</span>
										{:else if entry.action.includes('SUCCESS') || entry.action === 'REGISTER'}
											<span class="badge-olive">{entry.action}</span>
										{:else if entry.action.startsWith('ADMIN_')}
											<span class="badge-ochre">{entry.action}</span>
										{:else}
											<span class="badge" style="background: var(--surface-muted); color: var(--text-secondary);">{entry.action}</span>
										{/if}
									</td>
									<td class="px-4 py-2 font-mono text-xs hidden sm:table-cell" style="color: var(--text-muted);">{entry.ip_address || '-'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		<!-- Zero-knowledge reminder -->
		<div class="flex items-center justify-center gap-2 py-4">
			<Asterisk size={14} color="olive" />
			<span class="text-xs" style="color: var(--text-muted);">{$t('admin.zero_knowledge')}</span>
		</div>
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
