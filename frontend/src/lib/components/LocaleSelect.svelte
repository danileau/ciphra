<!--
	The language picker on /login and PublicFooter.

	CIPH-pi24-5e built this as a hand-rolled combobox, because a native
	<select> can be styled at rest but its options panel is browser chrome the
	CSS cascade cannot reach. That reasoning was right and outlived the file:
	the behaviour now lives in Listbox.svelte (2026-09-20), which every
	dropdown in the app shares — including the language picker in Settings,
	which was a native <select> until then. The same choice looked and behaved
	like two different controls depending on which screen you were on.

	What is left here is the binding: which options, and what picking one does.
-->
<script lang="ts">
	import { locale, locales, localeNames, t, type Locale } from '$lib/i18n';
	import Listbox from '$lib/components/Listbox.svelte';

	export let buttonClass = '';

	$: options = locales.map((l) => ({ value: l, label: localeNames[l] }));
</script>

<Listbox
	{options}
	value={$locale}
	variant="chip"
	align="end"
	{buttonClass}
	testid="locale-select"
	ariaLabel={$t('common.language')}
	on:change={(e) => locale.set(e.detail.value as Locale)}
/>
