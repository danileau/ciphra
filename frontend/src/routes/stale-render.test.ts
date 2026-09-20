/**
 * Rendered once, then frozen (2026-09-20).
 *
 * Reported from the running app: a custom symptom you had just created did
 * not appear in Settings until the page was reloaded. The list came from
 * `{@const items = customsForKind(section.kind)}` — a function that reads the
 * blueprint, called from an expression naming only the section. Svelte tracks
 * what an expression *names*, so nothing told it to re-run when the blueprint
 * changed. The `{#if bp}` around the list does not help: an if-block whose
 * condition stays truthy is never re-created.
 *
 * The same shape had shipped twice before anyone connected the two: the
 * calendar's day labels (#201, where the stale value was a translation) and —
 * found while fixing this one — the /reports totals row, which kept the
 * previous month's sums under the new month's grid.
 *
 * So this is a baseline, not a ban. Every entry below is a template
 * expression calling a function that reads reactive state the expression does
 * not name. Most are harmless today, because the value cannot change while
 * the block is mounted — but each is one data change away from showing a
 * stale number, and the list only shrinks by someone checking one and passing
 * the dependency in.
 *
 * A NEW entry fails this test. Retiring one means deleting it from KNOWN.
 */
import { describe, it, expect } from 'vitest';
import { parse } from 'svelte/compiler';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const FRONTEND = join(__dirname, '..', '..');
const SRC = join(FRONTEND, 'src');

/** `file::functionName` for every call of this shape that exists today. */
const KNOWN = new Set([
	'src/lib/components/DatePicker.svelte::dayClass',
	'src/lib/components/DatePicker.svelte::monthClass',
	'src/lib/components/DayDetail.svelte::epLabel',
	'src/lib/components/DayDetail.svelte::rescueMedLabel',
	'src/lib/components/DayDetail.svelte::rescueMedUnit',
	'src/lib/components/DayDetail.svelte::symptomLabel',
	'src/lib/components/DayDetail.svelte::triggerLabel',
	'src/lib/components/DayDetail.svelte::vitalLabel',
	'src/lib/components/DayDetail.svelte::vitalUnit',
	'src/lib/components/EntryComposer.svelte::formatDisplayDate',
	'src/lib/components/EntryPreview.svelte::epLabelFor',
	'src/lib/components/EntryPreview.svelte::formatDate',
	'src/lib/components/EntryPreview.svelte::rescueMedLabel',
	'src/lib/components/EntryPreview.svelte::rescueMedUnit',
	'src/lib/components/EntryPreview.svelte::symptomLabelFor',
	'src/lib/components/EntryPreview.svelte::triggerLabelFor',
	'src/lib/components/ExportNoteReview.svelte::fmt',
	'src/lib/components/ExportPeriodPopover.svelte::coverageOf',
	'src/lib/components/LastEntriesStrip.svelte::formatRowDate',
	'src/lib/components/LastEntriesStrip.svelte::summarize',
	'src/lib/components/LastEntriesStrip.svelte::typeLabel',
	'src/lib/components/MedicationCombineDialog.svelte::entrySummary',
	'src/lib/components/MedicationCombineDialog.svelte::rangeText',
	'src/lib/components/MedicationHistoryDialog.svelte::rangeText',
	'src/lib/components/MedicationManager.svelte::describe',
	'src/lib/components/MedicationManager.svelte::duplicatesOf',
	'src/lib/components/MedicationManager.svelte::fmt',
	'src/lib/components/MedicationManager.svelte::historyRangeText',
	'src/lib/components/MedicationTimeline.svelte::describe',
	'src/lib/components/MonthMiniSummary.svelte::labelOf',
	'src/routes/admin/+page.svelte::formatDate',
	'src/routes/admin/+page.svelte::formatDateTime',
	'src/routes/calendar/+page.svelte::dayHasEpisode',
	'src/routes/calendar/+page.svelte::dayHasRescueMed',
	'src/routes/calendar/+page.svelte::dayHasTrigger',
	'src/routes/calendar/+page.svelte::dayMultiDayBands',
	'src/routes/calendar/+page.svelte::dayPhase',
	'src/routes/calendar/+page.svelte::dayPhaseOverride',
	'src/routes/calendar/+page.svelte::hasMedChangeOn',
	'src/routes/journal/+page.svelte::formatDayHeader',
	'src/routes/journal/+page.svelte::formatMonthHeader',
	'src/routes/reports/+page.svelte::formatMonth',
	'src/routes/reports/+page.svelte::getMonthShortName',
	'src/routes/reports/+page.svelte::medChangeText',
]);

function walk(dir: string, acc: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			if (name === 'node_modules' || name.startsWith('.')) continue;
			walk(full, acc);
		} else if (name.endsWith('.svelte')) acc.push(full);
	}
	return acc;
}

const escapeName = (n: string) => n.replace('$', '\\$');

function scan(): Set<string> {
	const found = new Set<string>();
	for (const file of walk(SRC)) {
		const src = readFileSync(file, 'utf8');
		let ast: Record<string, any>;
		try {
			ast = parse(src) as unknown as Record<string, any>;
		} catch {
			continue;
		}
		const instance = ast.instance;
		if (!instance) continue;
		const script = src.slice(instance.content.start, instance.content.end);

		// Reactive names: store reads, and variables declared by `$:`.
		const reactive = new Set<string>();
		for (const m of script.matchAll(/\$([A-Za-z_][\w]*)/g)) reactive.add('$' + m[1]);
		for (const m of script.matchAll(/^\s*\$:\s*(?:\{\s*)?([A-Za-z_][\w]*)\s*=/gm)) reactive.add(m[1]);
		if (reactive.size === 0) continue;
		const namesIn = (text: string) =>
			[...reactive].filter((r) => new RegExp(`(^|[^\\w$])${escapeName(r)}\\b`).test(text));

		// Functions, from the AST: a return type like `{ id: string }[]` has a
		// brace of its own, so brace-matching from the declaration would read
		// the annotation as the body and see no dependencies at all.
		const fns = new Map<string, string[]>();
		const consider = (name: string | undefined, node: { start: number; end: number } | undefined) => {
			if (!name || !node) return;
			const reads = namesIn(src.slice(node.start, node.end));
			if (reads.length) fns.set(name, reads);
		};
		for (const node of instance.content.body as Array<Record<string, any>>) {
			const d = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
			if (!d) continue;
			if (d.type === 'FunctionDeclaration') consider(d.id?.name, d.body);
			if (d.type === 'VariableDeclaration') {
				for (const decl of d.declarations) {
					if (decl.init && /Function/.test(decl.init.type)) consider(decl.id?.name, decl.init.body ?? decl.init);
				}
			}
		}
		if (fns.size === 0) continue;

		const rel = relative(FRONTEND, file).replace(/\\/g, '/');
		const visit = (node: Record<string, any> | null, inEvent: boolean, ctx: string) => {
			if (!node || typeof node !== 'object') return;
			const isEvent =
				inEvent || node.type === 'EventHandler' || (node.type === 'Attribute' && /^on/.test(node.name));
			// {#each} re-renders its items and {#key} rebuilds outright. {#if}
			// does neither once its condition is truthy — which is exactly how
			// the custom-item list came to freeze.
			if (['EachBlock', 'KeyBlock', 'AwaitBlock'].includes(node.type) && node.expression) {
				ctx = `${ctx} ${src.slice(node.expression.start, node.expression.end)}`;
			}
			const exprs: Array<{ start: number; end: number }> = [];
			if (!isEvent) {
				if (node.expression?.start !== undefined) exprs.push(node.expression);
				if (node.type === 'Attribute' && Array.isArray(node.value)) {
					for (const v of node.value) if (v.expression) exprs.push(v.expression);
				}
			}
			for (const e of exprs) {
				const text = src.slice(e.start, e.end);
				for (const [name, reads] of fns) {
					if (!new RegExp(`(^|[^.\\w])${name}\\(`).test(text)) continue;
					const scope = `${text} ${ctx}`;
					if (reads.every((r) => !new RegExp(`(^|[^\\w$])${escapeName(r)}\\b`).test(scope))) {
						found.add(`${rel}::${name}`);
					}
				}
			}
			for (const [k, v] of Object.entries(node)) {
				if (k === 'parent' || k === 'metadata' || k === 'expression') continue;
				if (Array.isArray(v)) v.forEach((c) => visit(c, isEvent, ctx));
				else if (v && typeof v === 'object' && (v as Record<string, any>).type)
					visit(v as Record<string, any>, isEvent, ctx);
			}
		};
		visit(ast.html, false, '');
	}
	return found;
}

describe('a template expression names what it depends on', () => {
	const found = scan();

	it('has no new call that reads reactive state its expression never names', () => {
		const added = [...found].filter((f) => !KNOWN.has(f)).sort();
		expect(
			added,
			'These call a function that reads reactive state the expression does not name, so ' +
				'Svelte will not re-run them when it changes — the custom-symptom list and the ' +
				'/reports totals row both froze this way. Pass the dependency in (a reactive map, ' +
				'or the value as an argument), or add the entry to KNOWN with a reason.',
		).toEqual([]);
	});

	it('shrinks only — a fixed call is deleted from KNOWN', () => {
		const gone = [...KNOWN].filter((k) => !found.has(k)).sort();
		expect(gone, `Fixed, so delete from KNOWN: ${gone.join(', ')}`).toEqual([]);
	});

	it('does not list the three that actually broke', () => {
		for (const fixed of [
			'src/routes/settings/+page.svelte::customsForKind',
			'src/routes/settings/+page.svelte::isCustomHidden',
			'src/routes/reports/+page.svelte::symptomSum',
			'src/routes/reports/+page.svelte::itemLabel',
		]) {
			expect(found.has(fixed), `${fixed} is stale again`).toBe(false);
		}
	});
});
