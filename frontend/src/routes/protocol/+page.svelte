<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	onMount(() => {
		const view = $page.url.searchParams.get('view');
		const date = $page.url.searchParams.get('date');
		if (view === 'month') {
			goto('/reports', { replaceState: true });
		} else if (date) {
			goto(`/log/${date}`, { replaceState: true });
		} else {
			goto('/log/today', { replaceState: true });
		}
	});
</script>
