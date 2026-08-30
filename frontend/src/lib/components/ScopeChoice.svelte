<!--
	What a family invitation may read — the two options, in one place.

	Used when creating an invitation and when modifying one that already
	exists. Shared rather than written twice on purpose: these two lists must
	always offer the same options with the same wording, or "modify" would show
	a different promise from the one the person agreed to when they sent it.

	Radios rather than a checkbox because both answers are legitimate. A
	checkbox would frame one of them as the deviation, and keeping the diary to
	yourself is not a deviation.
-->
<script lang="ts">
	import { t } from '$lib/i18n';
	import { SHARE_MASK_SHARED_ONLY, SHARE_MASK_EVERYTHING } from '$lib/utils/shareClass';

	/** Bindable. Defaults closed — a privacy control does not pre-open itself. */
	export let value: number = SHARE_MASK_SHARED_ONLY;
	/** Distinguishes the radio groups when two are on the page at once. */
	export let name = 'scope';

	const OPTIONS = [
		{
			mask: SHARE_MASK_SHARED_ONLY,
			label: 'family.scope_shared_only',
			hint: 'family.scope_shared_only_hint',
		},
		{
			mask: SHARE_MASK_EVERYTHING,
			label: 'family.scope_everything',
			hint: 'family.scope_everything_hint',
		},
	];
</script>

<fieldset class="rounded-xl p-3" style="border: 1px solid var(--border)">
	<legend class="text-xs px-1" style="color: var(--text-muted)">{$t('family.scope_legend')}</legend>
	{#each OPTIONS as option}
		<label class="flex items-start gap-2 cursor-pointer py-1.5">
			<input type="radio" {name} bind:group={value} value={option.mask} class="mt-0.5 w-4 h-4" />
			<span>
				<span class="text-sm block" style="color: var(--text-primary)">{$t(option.label)}</span>
				<span class="text-xs" style="color: var(--text-muted)">{$t(option.hint)}</span>
			</span>
		</label>
	{/each}
</fieldset>
