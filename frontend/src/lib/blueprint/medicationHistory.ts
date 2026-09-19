import type { MedicationPeriod, MedicationSlot, MedicationStopReason } from './types';
import { toLocalISODate } from '$lib/date';

/**
 * Medication dose history (2026-09-16).
 *
 * Before this, a medication was one `{ dose, schedule }` record and no logged
 * day stored a dose. Editing "10 mg" to "12 mg" therefore rewrote every past
 * day to 12 mg — the doctor PDF showed a titration that never happened as a
 * dose that was always taken — and deleting the medication dropped it from
 * every report, although the days logged against it were still there.
 *
 * The model now: a medication keeps ONE id for life and carries `periods`,
 * each a dose + schedule between two local dates. A dose change closes the
 * running period the day before it takes effect and opens a new one; stopping
 * closes it; resuming opens another after the gap. Every reader asks "what
 * applied on THIS day" (`periodOn`), so history stays true and the change is
 * visible wherever a date is.
 *
 * History runs backwards too (2026-09-19): a medication's development before
 * ciphra — earlier doses, and drugs tried and stopped long ago — is entered
 * afterwards and marked `reported`. Those periods say what applied; they
 * never say a day was logged. See `prependPeriod` / `createPastMedication`.
 *
 * Everything here is pure: writers return a new MedicationSlot and never touch
 * the blueprint store. Dates are compared as `YYYY-MM-DD` strings, which sort
 * chronologically, so no Date/UTC round-trip can shift a day.
 */

/** `iso` shifted by `n` days, as a local `YYYY-MM-DD`. The Date is built from
 *  local Y/M/D (not parsed), so month/year overflow is handled and no timezone
 *  offset can move the result. */
export function addDaysISO(iso: string, n: number): string {
	const [y, m, d] = iso.split('-').map(Number);
	return toLocalISODate(new Date(y, m - 1, d + n));
}

function byFrom(a: MedicationPeriod, b: MedicationPeriod): number {
	// An open start sorts first: it is by definition the earliest period.
	if (!a.from) return b.from ? -1 : 0;
	if (!b.from) return 1;
	return a.from < b.from ? -1 : a.from > b.from ? 1 : 0;
}

/** The medication's periods, oldest first. A medication saved before dose
 *  history existed has none stored; it reads as a single period with no start
 *  and no end, carrying its one dose — which is exactly what the old model
 *  asserted about it. */
export function medPeriods(med: MedicationSlot): MedicationPeriod[] {
	if (med.periods && med.periods.length > 0) return coalesce([...med.periods].sort(byFrom));
	return [{ dose: med.dose ?? '', schedule: med.schedule ?? '' }];
}

const sameRegimen = (a: MedicationPeriod, b: MedicationPeriod) =>
	a.dose.trim() === b.dose.trim() && a.schedule.trim() === b.schedule.trim();

/** Join back-to-back periods that carry the same dose and schedule. A "change"
 *  to what already applied (10 mg → 8 mg, then 8 mg → 8 mg the next day) is
 *  not a step anyone took; showing it as one misstates the history. Applied on
 *  read, so data saved with such a step reads cleanly, and on write, so it is
 *  not stored again. A switch boundary is kept even with equal doses — it
 *  links two different medications, and so is a boundary between remembered
 *  and tracked history: joining those would claim days were logged that never
 *  were. */
function coalesce(periods: MedicationPeriod[]): MedicationPeriod[] {
	const out: MedicationPeriod[] = [];
	for (const p of periods) {
		const prev = out[out.length - 1];
		if (
			prev &&
			prev.to &&
			p.from &&
			addDaysISO(prev.to, 1) === p.from &&
			sameRegimen(prev, p) &&
			!prev.switchedTo &&
			!p.switchedFrom &&
			!!prev.reported === !!p.reported
		) {
			const joined: MedicationPeriod = {
				...prev,
				to: p.to,
				toPrecision: p.toPrecision,
				endNote: p.endNote,
				switchedTo: p.switchedTo,
				stopReason: p.stopReason,
			};
			if (!p.to) delete joined.to;
			if (!p.toPrecision) delete joined.toPrecision;
			if (!p.endNote) delete joined.endNote;
			if (!p.switchedTo) delete joined.switchedTo;
			if (!p.stopReason) delete joined.stopReason;
			const notes = [prev.note?.trim(), p.note?.trim()].filter(Boolean);
			if (notes.length > 0) joined.note = [...new Set(notes)].join(' · ');
			out[out.length - 1] = joined;
		} else {
			out.push({ ...p });
		}
	}
	return out;
}

function covers(p: MedicationPeriod, date: string): boolean {
	return (!p.from || p.from <= date) && (!p.to || date <= p.to);
}

/** The period that applied on `date`, or null if the medication was not being
 *  taken that day (not started yet, stopped, or in a gap). */
export function periodOn(med: MedicationSlot, date: string): MedicationPeriod | null {
	const periods = medPeriods(med);
	for (let i = periods.length - 1; i >= 0; i--) {
		if (covers(periods[i], date)) return periods[i];
	}
	return null;
}

export function isActiveOn(med: MedicationSlot, date: string): boolean {
	return periodOn(med, date) !== null;
}

/** Was the medication part of the regimen on `date` AND was that day tracked
 *  by ciphra? False inside history the person filled in afterwards
 *  (2026-09-19): those days were never logged, so counting them would invent
 *  missed doses. Everything that shows WHAT applied uses `periodOn`; only the
 *  readers that count days use this. */
export function isTrackedOn(med: MedicationSlot, date: string): boolean {
	const p = periodOn(med, date);
	return !!p && !p.reported;
}

/** True for a medication with one period and no recorded start or end — the
 *  shape of everything saved before dose history, and of a medication added
 *  without a start date. It applies on any day, known or not. */
export function isUnbounded(med: MedicationSlot): boolean {
	const periods = medPeriods(med);
	return periods.length === 1 && !periods[0].from && !periods[0].to;
}

/** First day the medication is recorded as taken, or null when the start is
 *  unknown (it predates the record). */
export function medStartDate(med: MedicationSlot): string | null {
	return medPeriods(med)[0].from ?? null;
}

export type MedStatus = 'active' | 'upcoming' | 'stopped';

/** Where the medication stands on `date`:
 *  - `active` — a period covers the day;
 *  - `upcoming` — every period starts later (added with a future start);
 *  - `stopped` — it was taken before and nothing covers the day (stopped, or
 *    paused in a gap before a planned resume). */
export function medStatusOn(med: MedicationSlot, date: string): MedStatus {
	if (isActiveOn(med, date)) return 'active';
	const periods = medPeriods(med);
	return periods.every((p) => p.from && p.from > date) ? 'upcoming' : 'stopped';
}

export interface PlannedChange {
	/** First day the new state applies. */
	date: string;
	/** The period starting that day, or null when the plan is a stop. */
	next: MedicationPeriod | null;
}

/** The next change after `date` that is already recorded — a dose change or
 *  stop entered ahead of time ("ab morgen 12 mg"). Null when nothing is
 *  planned. */
export function plannedChange(med: MedicationSlot, date: string): PlannedChange | null {
	const periods = medPeriods(med);
	const current = periodOn(med, date);
	const later = periods.find((p) => p.from && p.from > date);
	if (current?.to) {
		const dayAfter = addDaysISO(current.to, 1);
		if (later && later.from === dayAfter) return { date: dayAfter, next: later };
		return { date: dayAfter, next: null };
	}
	if (!current && later) return { date: later.from as string, next: later };
	return null;
}

/* ─── Writers ─────────────────────────────────────────────────────────── */

function withPeriods(med: MedicationSlot, periods: MedicationPeriod[]): MedicationSlot {
	const sorted = coalesce([...periods].sort(byFrom));
	const last = sorted[sorted.length - 1];
	// `dose`/`schedule` mirror the newest period: the value a reader that
	// predates dose history should show (see MedicationSlot).
	return { ...med, dose: last.dose, schedule: last.schedule, periods: sorted };
}

function clonePeriods(med: MedicationSlot): MedicationPeriod[] {
	return medPeriods(med).map((p) => ({ ...p }));
}

function cleanPeriod(p: MedicationPeriod): MedicationPeriod {
	const out: MedicationPeriod = { dose: p.dose, schedule: p.schedule };
	if (p.from) out.from = p.from;
	if (p.to) out.to = p.to;
	if (p.note?.trim()) out.note = p.note.trim();
	if (p.endNote?.trim()) out.endNote = p.endNote.trim();
	if (p.switchedTo) out.switchedTo = p.switchedTo;
	if (p.switchedFrom) out.switchedFrom = p.switchedFrom;
	if (p.reported) out.reported = true;
	if (p.from && p.fromPrecision) out.fromPrecision = p.fromPrecision;
	if (p.to && p.toPrecision) out.toPrecision = p.toPrecision;
	if (p.stopReason) out.stopReason = p.stopReason;
	return out;
}

/** Periods that ended before `from`, with the one running into `from` closed
 *  the day before. Anything that started on or after `from` is dropped: the
 *  change being recorded is the truth from that day on, and a plan entered
 *  earlier for a later date no longer holds. */
function truncateBefore(periods: MedicationPeriod[], from: string): MedicationPeriod[] {
	const dayBefore = addDaysISO(from, -1);
	const kept: MedicationPeriod[] = [];
	for (const p of periods) {
		if (p.from && p.from >= from) continue;
		if (!p.to || p.to >= from) {
			p.to = dayBefore;
			// A stop or switch recorded later than `from` is superseded too.
			delete p.endNote;
			delete p.switchedTo;
		}
		kept.push(p);
	}
	return kept;
}

/** A fresh medication id. Random rather than derived from the name: the id is
 *  the medication's identity for life, and a rename must not change it. */
export function newMedicationId(): string {
	try {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
	} catch { /* fall through */ }
	return `med-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface NewMedication {
	name: string;
	dose: string;
	schedule: string;
	asNeeded: boolean;
	/** First day taken; omit when the user doesn't know or it has "always"
	 *  been part of the regimen. */
	from?: string;
	note?: string;
}

export function createMedication(id: string, input: NewMedication): MedicationSlot {
	const period = cleanPeriod({
		from: input.from,
		dose: input.dose.trim(),
		schedule: input.schedule.trim(),
		note: input.note,
	});
	return withPeriods(
		{ id, name: input.name.trim(), dose: period.dose, schedule: period.schedule, asNeeded: input.asNeeded },
		[period],
	);
}

export interface DoseChange {
	/** First day the new dose/schedule applies. */
	from: string;
	dose: string;
	schedule: string;
	note?: string;
}

/** Record a dose and/or schedule change taking effect on `change.from`. Days
 *  before keep the dose they had. Also resumes a stopped medication: the gap
 *  since the stop stays a gap. */
export function applyDoseChange(med: MedicationSlot, change: DoseChange): MedicationSlot {
	const kept = truncateBefore(clonePeriods(med), change.from);
	kept.push(
		cleanPeriod({ from: change.from, dose: change.dose.trim(), schedule: change.schedule.trim(), note: change.note }),
	);
	return withPeriods(med, kept.map(cleanPeriod));
}

/** Record that the medication is no longer taken from `from` on (the first day
 *  WITHOUT it). Returns null when that would leave no day on which it was ever
 *  taken — that is not a stop, it is a mistaken medication, and the caller
 *  should offer delete instead. */
export function applyStop(
	med: MedicationSlot,
	from: string,
	opts: { endNote?: string; switchedTo?: string } = {},
): MedicationSlot | null {
	const kept = truncateBefore(clonePeriods(med), from);
	if (kept.length === 0) return null;
	const last = kept[kept.length - 1];
	if (opts.endNote) last.endNote = opts.endNote;
	if (opts.switchedTo) last.switchedTo = opts.switchedTo;
	return withPeriods(med, kept.map(cleanPeriod));
}

/** Earliest valid effective date for a stop or change: the day after the
 *  medication's recorded start (a change ON the start day would replace the
 *  whole history — that is a correction, not a change). Null = no lower bound
 *  (start unknown). */
export function earliestChangeDate(med: MedicationSlot): string | null {
	const start = medStartDate(med);
	return start ? addDaysISO(start, 1) : null;
}

/** Switch from one medication to another on `from`: `med` stops the day
 *  before, and the replacement starts that day. Both carry a link to the
 *  other so reports can draw them as one step. Returns null when `med` could
 *  not be stopped on that date (see `applyStop`). */
export function applySwitch(
	med: MedicationSlot,
	replacementId: string,
	replacement: Omit<NewMedication, 'from'>,
	from: string,
): { stopped: MedicationSlot; started: MedicationSlot } | null {
	const stopped = applyStop(med, from, { switchedTo: replacementId, endNote: replacement.note });
	if (!stopped) return null;
	const started = createMedication(replacementId, { ...replacement, from });
	started.periods = [{ ...(started.periods as MedicationPeriod[])[0], switchedFrom: med.id }];
	return { stopped, started };
}

/** Fix a typo: rename, and/or overwrite the dose + schedule of the LATEST
 *  period in place. Deliberately retroactive — every day in that period now
 *  reads the corrected value. The guided dialog labels it as such. */
export function applyCorrection(
	med: MedicationSlot,
	fix: { name: string; dose: string; schedule: string; asNeeded: boolean },
): MedicationSlot {
	const periods = clonePeriods(med);
	const last = periods[periods.length - 1];
	last.dose = fix.dose.trim();
	last.schedule = fix.schedule.trim();
	return withPeriods({ ...med, name: fix.name.trim(), asNeeded: fix.asNeeded }, periods.map(cleanPeriod));
}

/** Undo the most recent recorded step: a stop is lifted (the last period runs
 *  on), otherwise the newest period is removed and the one before it re-opens
 *  — unless a gap separated them, in which case the earlier stop stands.
 *  Null when there is nothing to undo. */
export function undoLastChange(med: MedicationSlot): MedicationSlot | null {
	const periods = clonePeriods(med);
	const last = periods[periods.length - 1];
	if (last.to) {
		delete last.to;
		delete last.endNote;
		delete last.switchedTo;
		return withPeriods(med, periods.map(cleanPeriod));
	}
	if (periods.length < 2) return null;
	periods.pop();
	const prev = periods[periods.length - 1];
	if (prev.to && last.from && addDaysISO(prev.to, 1) === last.from) {
		delete prev.to;
		delete prev.endNote;
	}
	return withPeriods(med, periods.map(cleanPeriod));
}

/* ─── History from before ciphra (2026-09-19) ─────────────────────────── */

/**
 * What the person remembers about a dose they took before ciphra recorded
 * anything. `to` defaults to the day before the earliest recorded day, so the
 * usual case — "and before that I was on 10 mg" — needs one date, or none at
 * all when the start is a blur.
 */
export interface HistoryEntry {
	dose: string;
	schedule: string;
	/** First day at this dose; omit when it is no longer known. */
	from?: string;
	/** Last day at this dose. Omit to run it up to what is already recorded. */
	to?: string;
	fromPrecision?: 'month';
	toPrecision?: 'month';
	note?: string;
}

/**
 * Add a dose period BEFORE everything already recorded, and return the new
 * medication — or null when the dates cannot be squared with the history that
 * exists.
 *
 * Deliberately not `applyDoseChange` with an old date: that one runs through
 * `truncateBefore` and drops every period from the given day on, because a
 * change is the truth from that day forward. Backfilling is the opposite
 * claim — it says what came before, and must leave every recorded day alone.
 *
 * A medication whose start ciphra never learned (no `from` on its first
 * period — the shape of every medication added without a start date) covers
 * all of the past, so nothing can sit in front of it. Recording earlier
 * history therefore gives that period the start it was missing: the day after
 * the remembered one ends. The dialog says so before saving.
 */
export function prependPeriod(med: MedicationSlot, entry: HistoryEntry): MedicationSlot | null {
	const dose = entry.dose.trim();
	if (!dose) return null;
	const periods = clonePeriods(med);
	const first = periods[0];
	const to = entry.to ?? (first.from ? addDaysISO(first.from, -1) : null);
	// Without an end there is no day at which the recorded regimen takes over.
	if (!to) return null;
	if (entry.from && entry.from > to) return null;
	if (first.from) {
		if (to >= first.from) return null;
	} else {
		// The open start becomes a recorded one.
		const adopted = addDaysISO(to, 1);
		if (first.to && adopted > first.to) return null;
		first.from = adopted;
	}
	const period = cleanPeriod({
		from: entry.from,
		to,
		dose,
		schedule: entry.schedule.trim(),
		note: entry.note,
		fromPrecision: entry.fromPrecision,
		toPrecision: entry.toPrecision,
		reported: true,
	});
	return withPeriods(med, [period, ...periods].map(cleanPeriod));
}

export interface PastMedication {
	name: string;
	dose: string;
	schedule: string;
	asNeeded: boolean;
	/** First day taken; omit when it is no longer known. */
	from?: string;
	/** Last day taken — a medication from the past has one by definition. */
	to: string;
	fromPrecision?: 'month';
	toPrecision?: 'month';
	stopReason?: MedicationStopReason;
	/** The person's own words for why it ended. Stays in the app. */
	endNote?: string;
}

/** A medication that was taken and stopped before ciphra: one remembered
 *  period, so it lands among the stopped medications and carries no claim
 *  about any logged day. Null when the dates contradict each other. */
export function createPastMedication(id: string, input: PastMedication): MedicationSlot | null {
	const dose = input.dose.trim();
	if (!input.name.trim() || !dose || !input.to) return null;
	if (input.from && input.from > input.to) return null;
	const period = cleanPeriod({
		from: input.from,
		to: input.to,
		dose,
		schedule: input.schedule.trim(),
		endNote: input.endNote,
		fromPrecision: input.fromPrecision,
		toPrecision: input.toPrecision,
		stopReason: input.stopReason,
		reported: true,
	});
	return withPeriods(
		{ id, name: input.name.trim(), dose: period.dose, schedule: period.schedule, asNeeded: input.asNeeded },
		[period],
	);
}

/** Drop one remembered period — the undo for a backfill that came out wrong.
 *  Only a remembered period can go: recorded history is never removed this
 *  way. Dates on the other periods stay as they are, including a start that
 *  the backfill established: that is what the person said, and guessing it
 *  back to "unknown" would throw away an answer they gave. Null when the
 *  index is not a remembered period, or when it is the only one left. */
export function removeReportedPeriod(med: MedicationSlot, index: number): MedicationSlot | null {
	const periods = clonePeriods(med);
	const target = periods[index];
	if (!target?.reported || periods.length < 2) return null;
	periods.splice(index, 1);
	return withPeriods(med, periods.map(cleanPeriod));
}

/** The span every medication together covers, for a report about the therapy
 *  itself rather than about a month. `from` is null when the earliest period
 *  has no recorded start. `to` runs to today, or further when a change is
 *  already planned. */
export function medHistorySpan(
	meds: MedicationSlot[],
	today: string = toLocalISODate(),
): { from: string | null; to: string } {
	let from: string | null = null;
	let openStart = false;
	let to = today;
	for (const med of meds) {
		for (const p of medPeriods(med)) {
			if (!p.from) openStart = true;
			else if (!from || p.from < from) from = p.from;
			for (const edge of [p.from, p.to]) if (edge && edge > to) to = edge;
		}
	}
	return { from: openStart ? null : from, to };
}

/* ─── Readers for reports ─────────────────────────────────────────────── */

export type MedChangeKind = 'start' | 'change' | 'stop';

export interface MedChange {
	/** First day the new state applies. */
	date: string;
	medId: string;
	name: string;
	kind: MedChangeKind;
	/** What applied up to the day before (change / stop). */
	before?: { dose: string; schedule: string };
	/** What applies from `date` (start / change). */
	after?: { dose: string; schedule: string };
	/** The reason given for the new state, or for the stop. */
	note?: string;
	/** Present when this start/stop is one half of a switch. */
	switchedFrom?: string;
	switchedTo?: string;
}

const regimen = (p: MedicationPeriod) => ({ dose: p.dose, schedule: p.schedule });

/** Every recorded start, dose change and stop, oldest first, optionally
 *  limited to changes taking effect within `[range.from, range.to]`. An
 *  unknown start produces no event — there is no date to put it on. */
export function medicationChanges(
	meds: MedicationSlot[],
	range: { from?: string; to?: string } = {},
): MedChange[] {
	const out: MedChange[] = [];
	for (const med of meds) {
		const periods = medPeriods(med);
		periods.forEach((p, i) => {
			const prev = i > 0 ? periods[i - 1] : null;
			const contiguous = !!(prev?.to && p.from && addDaysISO(prev.to, 1) === p.from);
			if (p.from) {
				if (prev && contiguous) {
					out.push({
						date: p.from, medId: med.id, name: med.name, kind: 'change',
						before: regimen(prev), after: regimen(p), note: p.note,
					});
				} else {
					out.push({
						date: p.from, medId: med.id, name: med.name, kind: 'start',
						after: regimen(p), note: p.note, switchedFrom: p.switchedFrom,
					});
				}
			}
			const next = periods[i + 1];
			const nextContiguous = !!(p.to && next?.from && addDaysISO(p.to, 1) === next.from);
			if (p.to && !nextContiguous) {
				out.push({
					date: addDaysISO(p.to, 1), medId: med.id, name: med.name, kind: 'stop',
					before: regimen(p), note: p.endNote, switchedTo: p.switchedTo,
				});
			}
		});
	}
	// Same day: stops before changes before starts, so a switch reads in the
	// order it happened ("A stopped → B started").
	const kindOrder: Record<MedChangeKind, number> = { stop: 0, change: 1, start: 2 };
	return out
		.filter((c) => (!range.from || c.date >= range.from) && (!range.to || c.date <= range.to))
		.sort((a, b) =>
			a.date < b.date ? -1 : a.date > b.date ? 1
				: kindOrder[a.kind] - kindOrder[b.kind] || a.name.localeCompare(b.name));
}

interface DayDoc {
	data?: Record<string, unknown>;
}

/** Every id logged days may carry for this medication: its own, plus the
 *  ids of duplicates combined into it. */
export function medIds(med: MedicationSlot): string[] {
	return [med.id, ...(med.mergedIds ?? [])];
}

/** The id of the configured medication an id logged on some day belongs to —
 *  itself, or the medication it was combined into. Unknown ids pass through
 *  (preset rescue medications, deleted medications). */
export function canonicalMedId(meds: MedicationSlot[] | null | undefined, id: string): string {
	const owner = (meds ?? []).find((m) => m.id === id || m.mergedIds?.includes(id));
	return owner ? owner.id : id;
}

/** Does this logged document mention the medication explicitly — a missed
 *  scheduled dose, an as-needed "taken" toggle, or an intake event? A
 *  medication also answers for the duplicates combined into it. */
export function docReferencesMed(doc: DayDoc, med: MedicationSlot | string): boolean {
	const ids = typeof med === 'string' ? [med] : medIds(med);
	const d = doc.data ?? {};
	if (d.type === 'event') return ids.includes(d.medicationId as string);
	if (d.type !== 'entry') return false;
	const missed = d.missedMedications;
	if (Array.isArray(missed) && missed.some((id) => ids.includes(id))) return true;
	const taken = d.medications as Record<string, unknown> | undefined;
	return ids.some((id) => !!taken?.[id]);
}

/** How many distinct days of history hang off this medication: days that
 *  mention it explicitly, plus — for a scheduled medication, which is assumed
 *  taken — every logged day it was active. This is what deleting it would
 *  strip the name and dose from. */
export function medHistoryDays(med: MedicationSlot, docs: DayDoc[]): number {
	const days = new Set<string>();
	for (const doc of docs) {
		const date = doc.data?.date;
		if (typeof date !== 'string') continue;
		if (docReferencesMed(doc, med)) {
			days.add(date);
		} else if (!med.asNeeded && doc.data?.type === 'entry' && isActiveOn(med, date)) {
			days.add(date);
		}
	}
	return days.size;
}

/* ─── Duplicates ──────────────────────────────────────────────────────── */

// Same dose-token shape as the epilepc migration's name parser
// (migration/epilepcMapping.ts): a number with a REQUIRED unit, so
// "Vitamin B12" keeps its 12.
const DOSE_TOKEN = /\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?\s*(?:mcg|µg|ug|mg|kg|ml|iu|ie|hübe?|hub|puffs?|tropfen|gtt|tabletten?|tabs?|stk|g|l|%)\b\.?/gi;

/** A name's identity for spotting duplicates: case- and whitespace-
 *  insensitive, ignoring an embedded dose ("Fycompa 8mg" = "fycompa"). Exact
 *  otherwise — a near-miss spelling may be a different drug, and combining
 *  two drugs would be a medical-safety bug. */
export function medNameKey(name: string): string {
	return name.replace(DOSE_TOKEN, ' ').toLowerCase().replace(/\s+/g, '');
}

/** Groups of two or more medications that look like the same drug — what
 *  the pre-dose-history workaround produced: one entry per dose. In list
 *  order, which is the order they were added. */
export function duplicateGroups(meds: MedicationSlot[]): MedicationSlot[][] {
	const byKey = new Map<string, MedicationSlot[]>();
	for (const med of meds) {
		const key = medNameKey(med.name);
		if (!key) continue;
		byKey.set(key, [...(byKey.get(key) ?? []), med]);
	}
	return [...byKey.values()].filter((group) => group.length > 1);
}

const EARLIEST = '0000-01-01';

/** Were both medications recorded as taken on some same day? Then combining
 *  them needs a date on which the later one takes over. */
export function medicationsOverlap(a: MedicationSlot, b: MedicationSlot): boolean {
	return medPeriods(a).some((p) =>
		medPeriods(b).some((q) => {
			const start = [p.from ?? EARLIEST, q.from ?? EARLIEST].sort()[1];
			const ends = [p.to, q.to].filter((x): x is string => !!x).sort();
			return ends.length === 0 || start <= ends[0];
		}),
	);
}

/** One history out of two: before `switchDate` whatever the EARLIER entry
 *  says applied, from `switchDate` on whatever the LATER one says — each
 *  falling back to the other on days it has nothing. So "10 mg (original
 *  entry) + 8 mg (duplicate added on 01.08.)" with switchDate 01.08. reads
 *  10 mg until 31.07. and 8 mg after, including days after the duplicate was
 *  stopped if the original was changed to 8 mg meanwhile. Without overlap the
 *  histories simply line up and `switchDate` is not needed. */
export function combineHistories(
	earlier: MedicationSlot,
	later: MedicationSlot,
	switchDate?: string,
): MedicationPeriod[] {
	const points = new Set<string>();
	for (const p of [...medPeriods(earlier), ...medPeriods(later)]) {
		if (p.from) points.add(p.from);
		if (p.to) points.add(addDaysISO(p.to, 1));
	}
	if (switchDate) points.add(switchDate);
	const starts = [...points].sort();

	// Cut the timeline at every boundary either entry has; inside one piece
	// the choice between them cannot change.
	const pieces: Array<{ from?: string; to?: string }> =
		starts.length === 0
			? [{}]
			: [
					{ to: addDaysISO(starts[0], -1) },
					...starts.map((from, i) => ({ from, to: i + 1 < starts.length ? addDaysISO(starts[i + 1], -1) : undefined })),
				];

	const out: MedicationPeriod[] = [];
	for (const piece of pieces) {
		const day = piece.from ?? EARLIEST;
		const e = periodOn(earlier, day);
		const l = periodOn(later, day);
		const chosen = switchDate && day >= switchDate ? l ?? e : e ?? l;
		if (!chosen) continue;
		const period: MedicationPeriod = { dose: chosen.dose, schedule: chosen.schedule };
		if (piece.from) period.from = piece.from;
		if (piece.to) period.to = piece.to;
		if (chosen.note && chosen.from === piece.from) period.note = chosen.note;
		if (chosen.endNote && chosen.to === piece.to) period.endNote = chosen.endNote;
		out.push(period);
	}
	return coalesce(out);
}

/** Combine `absorb` into `keep`: one medication, one history
 *  (`combineHistories`), and `absorb`'s id kept as an alias so every day
 *  logged against it stays attached. Nothing is deleted from any document.
 *  Returns null when the result would have no period at all. */
export function combineMedications(
	keep: MedicationSlot,
	absorb: MedicationSlot,
	opts: { earlierId: string; switchDate?: string },
): MedicationSlot | null {
	const earlier = opts.earlierId === absorb.id ? absorb : keep;
	const later = earlier === keep ? absorb : keep;
	const periods = combineHistories(earlier, later, opts.switchDate);
	if (periods.length === 0) return null;
	const mergedIds = [...new Set([...(keep.mergedIds ?? []), absorb.id, ...(absorb.mergedIds ?? [])])].filter(
		(id) => id !== keep.id,
	);
	return withPeriods({ ...keep, asNeeded: later.asNeeded, mergedIds }, periods);
}
