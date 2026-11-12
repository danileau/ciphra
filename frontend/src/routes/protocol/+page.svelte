<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	onMount(() => {
		const view = page.url.searchParams.get('view');
		const date = page.url.searchParams.get('date');
		if (view === 'month') {
			goto('/reports', { replace: true });
		} else if (date) {
			goto(`/log/${date}`, { replace: true });
		} else {
			goto('/log/today', { replace: true });
		}
	});
</script>
