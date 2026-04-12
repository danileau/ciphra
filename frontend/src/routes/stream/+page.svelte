<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	onMount(() => goto('/journal', { replaceState: true }));
</script>
