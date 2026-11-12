<!-- vitest stand-in for EntryComposer: renders only the date it was given.
	 See routes/log/[date]/date-param.test.ts. -->
<script lang="ts">
	let { date }: { date: string } = $props();
</script>

<p data-testid="composer-date">{date}</p>
